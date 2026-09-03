async function run() {
  const res = await fetch('http://localhost:8080/chat/whatsappNumbers/alan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'wajato_global_api_key_5544' },
    body: JSON.stringify({ numbers: ['5516991135129'] })
  });
  console.log('Number check alan:', await res.json());

  const res2 = await fetch('http://localhost:8080/chat/whatsappNumbers/amanda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'wajato_global_api_key_5544' },
    body: JSON.stringify({ numbers: ['5516991135129'] })
  });
  console.log('Number check amanda:', await res2.json());
}
run();
