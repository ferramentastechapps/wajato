async function run() {
  console.log('1. Chamando connect com number...');
  const r1 = await fetch('http://localhost:8080/instance/connect/carolina?number=5516982101526', {
    headers: { apikey: 'wajato_global_api_key_5544' }
  });
  console.log('R1:', await r1.json());

  console.log('Aguardando 4 segundos...');
  await new Promise(res => setTimeout(res, 4000));

  console.log('2. Chamando connect novamente...');
  const r2 = await fetch('http://localhost:8080/instance/connect/carolina', {
    headers: { apikey: 'wajato_global_api_key_5544' }
  });
  console.log('R2:', await r2.json());
}
run();
