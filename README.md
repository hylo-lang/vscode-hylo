Note, the Hylo compiler is in an early phase of development, so expect things to break. If you noitce issues, please submit either for the [Hylo compiler](https://github.com/hylo-lang/hylo/issues) or for the [VSCode extension](https://github.com/hylo-lang/vscode-hylo). if it's a known issue by searching for it.

If you want to get involved with developing Hylo, please reach out via [Slack](https://join.slack.com/t/val-qs97696/shared_invite/zt-1z3dsblrq-y4qXfEE6wr6uMEJSN9uFyg). 

## Setting Up Your Environment

### First-Time Setup

1. **Install the Hylo Compiler**
   - You will need to build the compiler from sources. For this, the recommended approach is to use **[development containers](https://code.visualstudio.com/docs/devcontainers/containers)** and VSCode.
   - Check the instructions at https://github.com/hylo-lang/hylo
1. **Install the Extension**
  - Install this extension. If you are working inside the Hylo devcontainer, it should be installed automatically.
  3. **Set Up Compilation Using Command Template** (Recommended):
    - Open VSCode Settings (`Ctrl+,` or `File > Preferences > Settings`)
    - Search for "Hylo"
    - Enable `hylo.useCommandTemplate`
    - Configure `hylo.commandTemplate` to match your setup. For example:
      - Default: `hc ${ARGS}` (assumes the compiler is in your PATH)
      - Example with Swift: `swift run hc ${ARGS}`

  4. **Alternative: Configure the Compiler Path**:
    - If you have built the compiler and prefer direct usage:
      - Open VSCode Settings (`Ctrl+,` or `File > Preferences > Settings`)
      - Search for "Hylo"
      - Set `hylo.compilerPath` to the path of your Hylo compiler
       - Example with absolute path: `C:\hylo\bin\hc` or `/usr/local/bin/hc`

### Project Configuration
Create a `.vscode/launch.json` or add it using the `Debug: Add configuration` action.
   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "type": "hylo",
         "request": "launch",
         "name": "Run Hylo Module",
         "program": "${workspaceFolder}/MyHyloModule",
         "isFolder": true
       },
       {
         "type": "hylo",
         "request": "launch",
         "name": "Run Hylo File",
         "program": "${workspaceFolder}/main.hylo"
       }
     ]
   }
   ```

## Common Workflows

### Single-File Development

Perfect for learning Hylo or creating small examples:

1. Create a new file with `.hylo` extension
2. Write your Hylo code
3. Run it directly with:
   - The play button in the editor title area
   - Right-click → "Hylo: Run Current File"
   - `Ctrl+Shift+P` → "Hylo: Run Current File"

Example workflow for a "Hello World" program:

1. Create `hello.hylo`:
   ```hylo
   fun main() {
     print("Hello, Hylo!")
   }
   ```
2. Click the play button in the editor title
3. See output in the "Hylo" output panel

### Multi-File Projects

For more complex projects with multiple Hylo files:

1. Organize your files into folders
2. Right-click on a folder → "Hylo: Compile and Run Folder"
3. Or set up a launch configuration for consistent debugging:
   ```json
   {
     "type": "hylo",
     "request": "launch",
     "name": "Run Project",
     "program": "${workspaceFolder}/src",
     "isFolder": true
   }
   ```

#### Custom Compiler Path

```json
{
  "type": "hylo",
  "request": "launch",
  "name": "Debug with Development Compiler",
  "program": "${file}",
  "compilerPath": "${workspaceFolder}/dev-tools/hc"
}
```

## Further Help
The language and this extension are in very early in their development. If you encounter any issues:

1. Check the [GitHub repository](https://github.com/hylo-lang/vscode-hylo) for updates
2. File issues for bugs or feature requests
3. Consult the Hylo language documentation for language-specific questions