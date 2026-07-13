# deploy.ps1
# Script local para commitar, dar push e disparar o deploy automático na VPS.

Write-Host "=== 📦 1. Adicionando alterações ao Git ===" -ForegroundColor Cyan
git add .

$commitMsg = Read-Host "Digite a mensagem do commit [Auto-deploy]"
if ([string]::IsNullOrEmpty($commitMsg)) {
    $commitMsg = "Auto-deploy: atualizações gerais"
}

Write-Host "=== 💾 2. Criando Commit ===" -ForegroundColor Cyan
git commit -m $commitMsg

Write-Host "=== 📤 3. Enviando para o GitHub ===" -ForegroundColor Cyan
git push

Write-Host "=== ⚙️  4. Iniciando Deploy na VPS (212.85.10.239) ===" -ForegroundColor Cyan
ssh root@212.85.10.239 "chmod +x /opt/wajato/deploy.sh && /opt/wajato/deploy.sh"

Write-Host "=== 🎉 Deploy automático finalizado com sucesso! ===" -ForegroundColor Green
