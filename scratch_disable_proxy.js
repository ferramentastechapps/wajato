async function run() {
  for (const name of ['amanda', 'bernardo']) {
    console.log(`Desativando proxy de ${name}...`);
    const r1 = await fetch(`http://localhost:8080/proxy/set/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: 'wajato_global_api_key_5544' },
      body: JSON.stringify({ enabled: false })
    });
    console.log('Set proxy response:', await r1.json().catch(() => r1.statusText));

    const r2 = await fetch(`http://localhost:8080/instance/restart/${name}`, {
      method: 'POST',
      headers: { apikey: 'wajato_global_api_key_5544' }
    });
    console.log('Restart response:', await r2.json().catch(() => r2.statusText));
  }
}
run();
