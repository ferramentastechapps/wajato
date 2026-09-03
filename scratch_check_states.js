async function run() {
  const res = await fetch('http://localhost:8080/instance/fetchInstances', {
    headers: { apikey: 'wajato_global_api_key_5544' }
  });
  const instances = await res.json();
  console.log('Instancias no Evolution:');
  for (const i of instances) {
    console.log(`- ${i.name}: connectionStatus = ${i.connectionStatus}, ownerJid = ${i.ownerJid}`);
  }
}
run();
