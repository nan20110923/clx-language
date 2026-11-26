#!/bin/sh
# 一次性配置：让 git 使用仓库里的 .githooks（而不是 .git/hooks）。
#
# 为什么需要一步手动操作：git 不跟踪 .git/hooks，core.hooksPath 又只能写在
# 本地配置里。所以钩子文件在仓库里，启用靠这个脚本。
#
# 由 docs/development.md 的「初始化」一节引用。幂等，可以重复执行。

set -e

cd "$(dirname "$0")/.."

git config core.hooksPath .githooks

echo "core.hooksPath = $(git config core.hooksPath)"
echo "pre-commit 会跑：yarn typecheck && yarn lint && yarn test"
echo
echo "跳过单次检查用 git commit --no-verify。"
