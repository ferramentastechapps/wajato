async function run() {
  const instances = ['alan', 'amanda', 'bernardo', 'diogo', 'laura', 'vitoria', 'michel', 'bruna', 'sabrina'];
  console.log('Testando socket real de cada instância...');
  for (const name of instances) {
    try {
      const res = await fetch(`http://localhost:8080/chat/whatsappNumbers/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: 'wajato_global_api_key_5544' },
        body: JSON.stringify({ numbers: ['5516991135129'] })
      });
      const data = await res.json();
      const ok = Array.isArray(data) && data[0]?.exists === true;
      console.log(`- ${name}: ${ok ? '✅ OK' : '❌ ERRO (' + (data?.output?.payload?.message || data?.message || 'Falha') + ')'}`);
    } catch (e) {
      console.log(`- ${name}: ❌ EXCEPTION (${e.message})`);
    }
  }
  process.exit(0);
}
run();
