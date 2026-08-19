import * as XLSX from 'xlsx';

export interface ParsedCatalogResult {
  text: string;
  count: number;
  items: Array<{
    name: string;
    category?: string;
    price?: string;
    description?: string;
    linkOrCode?: string;
    extraFields?: Record<string, string>;
  }>;
}

/**
 * Faz o parsing de arquivos de planilha (.xlsx, .xls, .csv, .tsv, .txt) e formata
 * em um texto estruturado de base de conhecimento para o Chatbot IA do WaJato.
 */
export function parseProductSpreadsheet(file: File): Promise<ParsedCatalogResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        if (!buffer) {
          throw new Error('Não foi possível ler o arquivo selecionado.');
        }

        const data = new Uint8Array(buffer as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('Nenhuma aba encontrada na planilha.');
        }

        // Pega a primeira aba
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Converte linhas para JSON
        const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawRows || rawRows.length === 0) {
          throw new Error('A planilha está vazia ou sem linhas reconhecíveis.');
        }

        const parsedItems: ParsedCatalogResult['items'] = [];
        const formattedBlocks: string[] = [];

        rawRows.forEach((row, index) => {
          const keys = Object.keys(row);
          if (keys.length === 0) return;

          // Função de correspondência semântica de colunas (ignora acentos e maiúsculas)
          const findVal = (keywords: string[]): { val: string; keyUsed: string } => {
            for (const k of keys) {
              const normalized = k
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim();

              if (keywords.some((kw) => normalized === kw || normalized.includes(kw))) {
                const val = String(row[k] ?? '').trim();
                if (val) return { val, keyUsed: k };
              }
            }
            return { val: '', keyUsed: '' };
          };

          const nameMatch = findVal(['nome', 'produto', 'servico', 'item', 'titulo', 'name', 'title', 'plano']);
          const categoryMatch = findVal(['categoria', 'departamento', 'tipo', 'grupo', 'category', 'segmento']);
          const priceMatch = findVal(['preco', 'valor', 'price', 'r$', 'custo', 'mensalidade']);
          const descMatch = findVal(['descricao', 'detalhe', 'sobre', 'especificacao', 'obs', 'observacao', 'description']);
          const linkMatch = findVal(['codigo', 'sku', 'ref', 'link', 'url', 'site', 'id']);

          const usedKeys = new Set([
            nameMatch.keyUsed,
            categoryMatch.keyUsed,
            priceMatch.keyUsed,
            descMatch.keyUsed,
            linkMatch.keyUsed,
          ].filter(Boolean));

          // Nome principal
          const name = nameMatch.val || (keys[0] ? String(row[keys[0]] ?? '').trim() : `Item #${index + 1}`);
          if (!name) return;

          const category = categoryMatch.val;
          let price = priceMatch.val;
          if (price) {
            // Formata preço caso seja numérico simples
            if (!price.toLowerCase().includes('r$') && !isNaN(Number(price.replace(',', '.')))) {
              const num = Number(price.replace(',', '.'));
              price = `R$ ${num.toFixed(2).replace('.', ',')}`;
            }
          }
          const description = descMatch.val;
          const linkOrCode = linkMatch.val;

          // Coleta outros campos personalizados presentes na planilha
          const extraFields: Record<string, string> = {};
          keys.forEach((k) => {
            if (!usedKeys.has(k)) {
              const v = String(row[k] ?? '').trim();
              if (v) extraFields[k] = v;
            }
          });

          // Monta o bloco formatado em texto para a IA
          let block = `• ${name}`;
          if (category) block += `\n  - Categoria: ${category}`;
          if (price) block += `\n  - Preço: ${price}`;
          if (description) block += `\n  - Descrição: ${description}`;
          if (linkOrCode) block += `\n  - Código/Link: ${linkOrCode}`;

          Object.entries(extraFields).forEach(([field, val]) => {
            block += `\n  - ${field}: ${val}`;
          });

          parsedItems.push({
            name,
            category,
            price,
            description,
            linkOrCode,
            extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
          });

          formattedBlocks.push(block);
        });

        if (parsedItems.length === 0) {
          throw new Error('Nenhum item válido pôde ser extraído das colunas da planilha.');
        }

        resolve({
          text: formattedBlocks.join('\n\n'),
          count: parsedItems.length,
          items: parsedItems,
        });
      } catch (err: any) {
        reject(new Error(err.message || 'Erro ao processar planilha'));
      }
    };

    reader.onerror = () => reject(new Error('Erro na leitura do arquivo'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Gera e baixa uma planilha modelo Excel (.xlsx) com produtos de exemplo.
 */
export function downloadSampleExcel() {
  const sampleData = [
    {
      'Nome do Produto / Serviço': 'Plano Pro Mensal',
      'Categoria': 'Software / SaaS',
      'Preço': 'R$ 199,00/mês',
      'Descrição e Detalhes': 'Disparos ilimitados, 5 chips conectados, Chatbot IA e Aquecedor Inteligente',
      'Código / Link': 'https://wajato.ftech-apps.com.br/planos',
    },
    {
      'Nome do Produto / Serviço': 'Tênis Esportivo Nitro Max',
      'Categoria': 'Calçados & Esporte',
      'Preço': 'R$ 249,90',
      'Descrição e Detalhes': 'Amortecimento a ar, tecido respirável, tamanhos do 38 ao 44, cores Preto e Branco',
      'Código / Link': 'REF-NITRO-01',
    },
    {
      'Nome do Produto / Serviço': 'Consultoria Estratégica Individual (1h)',
      'Categoria': 'Consultoria & Serviços',
      'Preço': 'R$ 350,00',
      'Descrição e Detalhes': 'Análise completa de funil de vendas WhatsApp com plano de ação em PDF incluso',
      'Código / Link': 'https://wajato.ftech-apps.com.br/consultoria',
    },
    {
      'Nome do Produto / Serviço': 'Curso de Vendas no WhatsApp',
      'Categoria': 'Educação Online',
      'Preço': 'R$ 97,00',
      'Descrição e Detalhes': 'Acesso vitalício, certificado, mais de 40 aulas práticas com modelos de mensagens',
      'Código / Link': 'REF-CURSO-WA',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  // Ajusta largura das colunas
  worksheet['!cols'] = [
    { wch: 35 }, // Nome
    { wch: 22 }, // Categoria
    { wch: 18 }, // Preço
    { wch: 55 }, // Descrição
    { wch: 35 }, // Link / Ref
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Produtos');
  XLSX.writeFile(workbook, 'modelo_catalogo_produtos_wajato.xlsx');
}

/**
 * Gera e baixa uma planilha modelo CSV (.csv com delimitador ponto e vírgula e UTF-8 BOM).
 */
export function downloadSampleCSV() {
  const csvContent =
    '\uFEFF' + // UTF-8 BOM para garantir acentuação correta no Excel brasileiro
    'Nome do Produto / Serviço;Categoria;Preço;Descrição e Detalhes;Código / Link\n' +
    'Plano Pro Mensal;Software / SaaS;R$ 199,00/mês;Disparos ilimitados, 5 chips conectados, Chatbot IA e Aquecedor Inteligente;https://wajato.ftech-apps.com.br/planos\n' +
    'Tênis Esportivo Nitro Max;Calçados & Esporte;R$ 249,90;Amortecimento a ar, tecido respirável, tamanhos do 38 ao 44, cores Preto e Branco;REF-NITRO-01\n' +
    'Consultoria Estratégica Individual (1h);Consultoria & Serviços;R$ 350,00;Análise completa de funil de vendas WhatsApp com plano de ação em PDF incluso;https://wajato.ftech-apps.com.br/consultoria\n' +
    'Curso de Vendas no WhatsApp;Educação Online;R$ 97,00;Acesso vitalício, certificado, mais de 40 aulas práticas com modelos de mensagens;REF-CURSO-WA\n';

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', 'modelo_catalogo_produtos_wajato.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
