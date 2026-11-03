' Liga o conector sem abrir janela (e o que roda quando o Windows inicia).
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "cmd /c """ & pasta & "\iniciar.cmd""", 0, False
