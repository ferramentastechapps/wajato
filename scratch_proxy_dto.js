async function test() {
  const r = await fetch('http://localhost:8080/proxy/set/amanda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'wajato_global_api_key_5544' },
    body: JSON.stringify({
      enabled: true,
      host: '85.198.45.19',
      port: '5943',
      protocol: 'http',
      username: 'stcypwhw',
      password: 'syblthuwg90k'
    })
  });
  console.log('Status 3 (port as string):', r.status);
  console.log('Body 3:', JSON.stringify(await r.json(), null, 2));
}
test();
