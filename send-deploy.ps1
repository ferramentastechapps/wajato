# send-deploy.ps1
# Script para empacotar o projeto localmente e enviar via SCP para a VPS, rodando o deploy em seguida.

$VpsIp = "212.85.10.239"
$VpsUser = "root"
$VpsPath = "/opt/wajato"

Write-Host "=== 📦 Empacotando arquivos para deploy ===" -ForegroundColor Cyan
if (Test-Path "deploy-warmup.zip") { Remove-Item "deploy-warmup.zip" -Force }

# Compacta os arquivos mantendo estrutura
Compress-Archive -Path "src", "prisma", "package.json", "package-lock.json", "tsconfig.json", "vitest.config.ts", "upgrade-warmup.sh" -DestinationPath "deploy-warmup.zip"

Write-Host "=== 📤 Enviando deploy-warmup.zip para a VPS ($VpsIp) ===" -ForegroundColor Cyan
scp deploy-warmup.zip "$($VpsUser)@$($VpsIp):$VpsPath/"

Write-Host "=== ⚙️  Executando upgrade na VPS ===" -ForegroundColor Cyan
ssh "$($VpsUser)@$($VpsIp)" "cd $VpsPath && unzip -o deploy-warmup.zip; rm -f deploy-warmup.zip; chmod +x upgrade-warmup.sh && ./upgrade-warmup.sh"

Write-Host "=== ✅ Deploy do Warmup v3.0 Concluído! ===" -ForegroundColor Green
