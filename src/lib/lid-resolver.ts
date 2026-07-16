import fs from 'fs';
import path from 'path';

const MAPPINGS_FILE = path.join(process.cwd(), 'lid-mappings.json');

// Memory cache
let memoryMappings: Record<string, string> = {};

function loadMappings() {
  try {
    if (fs.existsSync(MAPPINGS_FILE)) {
      const data = fs.readFileSync(MAPPINGS_FILE, 'utf8');
      memoryMappings = JSON.parse(data);
    }
  } catch (err) {
    console.error('[LID Resolver] Erro ao carregar mapeamentos:', err);
  }
}

// Carrega na inicialização
loadMappings();

export const lidResolver = {
  getPhone(lid: string): string | null {
    const cleanLid = lid.split('@')[0];
    return memoryMappings[cleanLid] || null;
  },

  addMapping(lid: string, phone: string) {
    const cleanLid = lid.split('@')[0];
    const cleanPhone = phone.split('@')[0].replace(/\D/g, '');
    
    if (!cleanLid || !cleanPhone || cleanLid === cleanPhone) return;

    if (memoryMappings[cleanLid] !== cleanPhone) {
      memoryMappings[cleanLid] = cleanPhone;
      try {
        fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(memoryMappings, null, 2), 'utf8');
        console.log(`[LID Resolver] Mapeamento adicionado: ${cleanLid} -> ${cleanPhone}`);
      } catch (err) {
        console.error('[LID Resolver] Erro ao salvar mapeamento:', err);
      }
    }
  }
};
