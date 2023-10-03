import { Uri, window, workspace } from "vscode";
import { TextEncoder } from 'util';

export class FileUtil {

    static async createDebugFile(fileName: string, content: string): Promise<Uri | undefined> {
        let folderUri = workspace.workspaceFolders![0].uri
        let fileUri = Uri.joinPath(folderUri, fileName)
        try {
            const encoder = new TextEncoder()
            await workspace.fs.writeFile(fileUri, encoder.encode(content))
            return fileUri
        } catch (error) {
            window.showErrorMessage(`Failed to create the file ${fileName}. Error message: ${error}`)
            return undefined
        }
    }
}