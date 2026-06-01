const fs = require('fs');
const path = require('path');
const os = require('os');

function getStartupDir() {
  return path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

function enableAutostart() {
  const startupDir = getStartupDir();
  if (!fs.existsSync(startupDir)) {
    console.error(`[Error] Startup directory does not exist: ${startupDir}`);
    return false;
  }

  const nodePath = process.execPath;
  const scriptPath = path.resolve(path.join(__dirname, '..', 'bin', 'agent-orbit.js'));
  const logFilePath = path.join(os.homedir(), '.config', 'agent-orbit', 'windows-boot.log');

  // Create a silent VBS helper to launch the script completely hidden and write boot logs
  const vbsPath = path.join(os.homedir(), '.config', 'agent-orbit', 'agent-orbit-silent.vbs');
  const vbsContent = `Dim WinScriptHost, fs, logFile
Set fs = CreateObject("Scripting.FileSystemObject")
Set logFile = fs.OpenTextFile("${logFilePath.replace(/\\/g, '\\\\')}", 8, True)
logFile.WriteLine Now & " - Windows startup triggered agent-orbit daemon."

On Error Resume Next
Set WinScriptHost = CreateObject("WScript.Shell")
WinScriptHost.Run Chr(34) & "${nodePath.replace(/\\/g, '\\\\')}" & Chr(34) & " " & Chr(34) & "${scriptPath.replace(/\\/g, '\\\\')}" & Chr(34) & " watch", 0

If Err.Number <> 0 Then
  logFile.WriteLine Now & " - [Error] Daemon launch failed: " & Err.Description
Else
  logFile.WriteLine Now & " - Daemon successfully launched headlessly in background."
End If

logFile.Close
Set WinScriptHost = Nothing
Set fs = Nothing`;

  const configDir = path.dirname(vbsPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(vbsPath, vbsContent, 'utf8');

  // Create a shortcut wrapper inside the Windows Startup folder pointing to our silent VBScript
  const shortcutPath = path.join(startupDir, 'agent-orbit.bat');
  const batContent = `@echo off
wscript.exe "${vbsPath}"
`;

  fs.writeFileSync(shortcutPath, batContent, 'utf8');
  console.log('[Orbit] Successfully enabled Windows Startup silent batch shortcut with boot logger.');
  return true;
}

function disableAutostart() {
  const startupDir = getStartupDir();
  const shortcutPath = path.join(startupDir, 'agent-orbit.bat');
  const vbsPath = path.join(os.homedir(), '.config', 'agent-orbit', 'agent-orbit-silent.vbs');

  if (fs.existsSync(shortcutPath)) {
    fs.unlinkSync(shortcutPath);
  }
  if (fs.existsSync(vbsPath)) {
    fs.unlinkSync(vbsPath);
  }

  console.log('[Orbit] Successfully disabled Windows Startup shortcut.');
  return true;
}

module.exports = {
  enableAutostart,
  disableAutostart
};
