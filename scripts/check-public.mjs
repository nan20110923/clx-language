#!/usr/bin/env node
/**
 * 检查对外可见的内容里有没有不该公开的东西。
 *
 * 这个仓库是 **public**：代码、文档、提交历史、GitHub Releases 上的 asset
 * 全都对外可见。一次疏忽就会永久留在历史里（改工作区没用，历史还能翻出来）。
 *
 * 检查四类：
 *   1. 本机绝对路径     —— /Users/<name>、/home/<name>、C:\Users\<name>   (allow-public: 示例文字，不是真实路径)
 *   2. 内网地址         —— 私有 IP 段、*.<内网域>、非标准端口上的私有主机
 *   3. 凭据             —— GitHub token、私钥块、常见 secret 变量赋值
 *   4. 本地垃圾         —— .DS_Store、__MACOSX、被追踪的 .env
 *
 * 用法：
 *   node scripts/check-public.mjs                  # 检查被 git 追踪的文件
 *   node scripts/check-public.mjs --staged         # 只检查暂存区（pre-commit 用）
 *   node scripts/check-public.mjs --history        # 连整个 git 历史一起查（慢）
 *   node scripts/check-public.mjs path/to/file     # 检查指定文件
 *
 * 退出码：0 干净，1 发现问题，2 用法/环境错误。
 *
 * 关于误报：这些模式必然会误报（比如文档里讨论 "/Users/<name> 这种写法不该出现"）。   (allow-public: 示例文字，不是真实路径)
 * 所以支持行内豁免：在该行加 `allow-public` 注释即可跳过。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

/** 行内豁免标记 */
const ALLOW_MARKER = 'allow-public';

/**
 * 历史检查的路径白名单。
 *
 * 为什么需要：历史检查读到的是**已删除或已修改**的旧内容，行内豁免标记加不
 * 进去（文件都改了，标记也没了）。所以对"历史里出现过、但确认无害"的路径
 * 单独登记。
 *
 * 只登记路径**不**登记内容 —— 这些文件在**当前**工作区仍然要过完整检查。
 * 加东西进来必须有理由，不要因为"懒得看"就加。
 */
const HISTORY_ALLOWLIST = new Set([
  // Lua 官方手册的字符串示例里有 /home/roberto（Lua 5.x 文档的经典例子）。  (allow-public)
  // 这批存根已于 1.3.0 删除，历史上出现过但确实是公开文档内容。
  'res/std/string.lua',
  'res/std_zh/string.lua'
]);

/**
 * 检查规则。每条给出 id、正则、说明。
 *
 * 用 `g` 标志为了逐行找出所有命中；每行单独匹配，所以不涉及 lastIndex 残留。
 */
const RULES = [
  {
    id: 'absolute-path',
    // 本机路径。要求路径里至少还有一段，避免匹配到 "/Users/" 这种泛指。
    // 允许 ${...} 变量形式：${workspaceFolder}/... 是合法写法。
    pattern: /(?:\/Users\/|\/home\/|\/root\/)[A-Za-z0-9._-]+|C:\\\\?Users\\\\?[A-Za-z0-9._-]+/g,
    message: 'absolute path from a developer machine'
  },
  {
    id: 'private-ip',
    // RFC1918 + 链路本地。不匹配文档里常见的示例地址需要靠豁免标记。
    pattern: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3})\b/g,
    message: 'private network address'
  },
  {
    id: 'internal-host',
    // 内网域名后缀与非标准私有主机名。local 是 mDNS，corp/internal/intranet 是
    // 企业内网惯例；.vicp.net 这类动态域名穿透服务也归到这里。
    //
    // 三条边界，都是为了避开误报：
    //   (?<![.\w-])  主机名前面不能是点或词字符 —— 否则 TextMate 作用域名
    //                `storage.modifier.local.lua` 会被当成 `modifier.local`  (allow-public)
    //   显式排除 .lua/.json/.ts 等扩展名，避免把 `<name>.local.lua` 这种文件路径
    //                当主机名（LuaLS 存根、测试夹具里常见）
    pattern: /(?<![.\w-])[a-z0-9-]+\.(?:local|internal|intranet|corp|lan|vicp\.net|ngrok\.io)\b(?!\.(?:lua|luau|json|jsonc|ts|js|mjs|cjs|md|yml|yaml|png|bmp|txt|exe|app|dylib|dll|so)\b)/gi,
    message: 'internal or tunnel hostname'
  },
  {
    id: 'svn-remote',
    // SVN 内网仓库地址。http(s)://<host>:<port>/svn/
    pattern: /(?:svn|https?):\/\/[^\s/]+:\d{2,5}\/svn\//gi,
    message: 'internal version-control remote'
  },
  {
    id: 'github-token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    message: 'GitHub token'
  },
  {
    id: 'private-key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    message: 'private key block'
  },
  {
    id: 'secret-assignment',
    // 形如 password = "..."，值至少 8 位且不是占位符。
    // 排除常见的伪值：空串、xxxxx、****、changeme、example、placeholder、${...}。
    pattern: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*['"](?![*x#<]{4}|changeme|example|placeholder|\$\{)[^'"]{8,}['"]/gi,
    message: 'hardcoded credential'
  }
];

/** 不检查的路径，避免扫到依赖、构建产物和工具目录。 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.artifacts',
  'dist',
  '.zcode',
  '.vscode-test'
]);

/** 二进制扩展名：不按文本扫。 */
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp',
  '.zip', '.gz', '.tgz', '.tar', '.jar', '.vsix', '.pdf',
  '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.wav', '.mp4', '.mov'
]);

/** @returns {string[]} 要检查的文件（repo 相对路径） */
function filesToCheck(argv) {
  if (argv.includes('--staged')) {
    // --cached 列出暂存区；-z 用 NUL 分隔，避免中文文件名被转义
    const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    });
    return out.split('\0').filter(Boolean);
  }

  const explicit = argv.filter(a => !a.startsWith('--'));
  if (explicit.length > 0) {
    return explicit.map(p => path.relative(REPO_ROOT, path.resolve(p)));
  }

  const out = execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

function shouldSkip(relative) {
  const parts = relative.split(/[\\/]/);
  if (parts.some(p => SKIP_DIRS.has(p))) {
    return true;
  }
  return BINARY_EXT.has(path.extname(relative).toLowerCase());
}

/** 检查一段文本，返回命中列表。 */
function scanText(text, label) {
  const findings = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(ALLOW_MARKER)) {
      continue;
    }
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(line);
      if (!match) {
        continue;
      }
      findings.push({
        label,
        line: i + 1,
        rule: rule.id,
        message: rule.message,
        excerpt: line.trim().slice(0, 160),
        match: match[0]
      });
    }
  }
  return findings;
}

/** 检查工作区/暂存区的文件。 */
function checkFiles(files) {
  const findings = [];
  for (const relative of files) {
    if (shouldSkip(relative)) {
      continue;
    }
    const absolute = path.join(REPO_ROOT, relative);
    let text;
    try {
      text = fs.readFileSync(absolute, 'utf8');
    } catch {
      continue; // 已删除或不可读
    }
    // 简单的二进制兜底：含 NUL 就跳过
    if (text.includes('\0')) {
      continue;
    }
    findings.push(...scanText(text, relative));
  }
  return findings;
}

/**
 * 检查整个 git 历史。
 *
 * 为什么单独一趟：工作区干净不代表历史干净。曾经提交过的凭据必须被知道
 * （要清理得重写历史），而后来的删除操作在 git log 里依然可见。
 *
 * 实现：先 `git log -S` 按内容粗筛，再对命中的提交取文件内容用同一套 RULES
 * 精筛。不用 `git grep -E` 直接匹配，是因为 JS 正则与 POSIX ERE 语义不同
 * （\b、lookaround 都不支持），简化的模式会制造大量误报 ——
 * 实测 Lua 官方文档里的示例路径 `/home/roberto` 被误报成 129 条。  (allow-public)
 */
function checkHistory() {
  const findings = [];
  const commits = execFileSync('git', ['rev-list', '--all'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

  // 粗筛用的字面量：宁可多捞，后面用 RULES 精筛
  const needles = [
    '/Users/',
    '/home/',
    'C:\\Users',
    'hzxzyq',
    'vicp.net',
    'PRIVATE KEY',
    'ghp_',
    'github_pat_'
  ];

  // 对每个 needle 找出"曾经引入过它的提交"，只保留最新那个（同一个内容
  // 在历史里会重复出现很多次，全报出来没有价值）
  const seen = new Set();
  for (const needle of needles) {
    let out;
    try {
      out = execFileSync(
        'git',
        ['log', '--all', '--format=%H', '--reverse', '-S', needle, '--', '.'],
        { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
      );
    } catch {
      continue;
    }
    const hitCommits = out.split('\n').filter(Boolean);
    for (const sha of hitCommits) {
      // 取该提交改动的文件，逐个用 RULES 精筛
      let files;
      try {
        files = execFileSync('git', ['show', '--name-only', '--format=', sha], {
          cwd: REPO_ROOT,
          encoding: 'utf8'
        })
          .split('\n')
          .filter(Boolean);
      } catch {
        continue;
      }
      for (const file of files) {
        if (shouldSkip(file)) {
          continue;
        }
        if (HISTORY_ALLOWLIST.has(file)) {
          continue;
        }
        const key = `${file}`;
        if (seen.has(key)) {
          continue;
        }
        let content;
        try {
          // 该提交里这个文件可能已被删除（git show --name-only 会列出删除的文件）
          // 或本身是二进制；读不到就跳过，不要往 stderr 喷 fatal。
          content = execFileSync('git', ['show', `${sha}:${file}`], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            maxBuffer: 32 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'ignore']
          });
        } catch {
          continue;
        }
        if (content.includes('\0')) {
          continue;
        }
        const hits = scanText(content, file);
        if (hits.length > 0) {
          seen.add(key);
          findings.push(
            ...hits.map(h => ({
              ...h,
              label: `${h.label} @ ${sha.slice(0, 8)}`
            }))
          );
        }
      }
    }
  }
  return findings;
}

function main() {
  const argv = process.argv.slice(2);
  const findings = [];

  if (argv.includes('--history')) {
    findings.push(...checkHistory());
  }

  const files = filesToCheck(argv);
  if (files.length === 0 && !argv.includes('--history')) {
    console.log('check-public: nothing to check.');
    return;
  }
  findings.push(...checkFiles(files));

  if (findings.length === 0) {
    console.log(`check-public: OK (${files.length} file(s), no sensitive patterns).`);
    return;
  }

  console.error(`check-public: ${findings.length} problem(s) found — this repository is public.\n`);
  for (const f of findings) {
    console.error(`  ${f.label}:${f.line}  [${f.rule}]  ${f.message}`);
    console.error(`    ${f.excerpt}`);
    if (f.match && f.match !== f.excerpt) {
      console.error(`    matched: ${f.match}`);
    }
  }
  console.error(
    `\nIf a hit is intentional (for example, documentation about what NOT to commit),\n` +
    `add the "${ALLOW_MARKER}" marker to that line.`
  );
  process.exitCode = 1;
}

try {
  main();
} catch (e) {
  console.error('check-public failed to run:', e instanceof Error ? e.message : e);
  process.exitCode = 2;
}
