'use client';

import React, { useState, useEffect } from 'react';
import { X, Flame, Clock, TrendingUp, Zap, MessageSquare, Briefcase, HelpCircle, Settings, Heart } from 'lucide-react';

interface Props {
  initialSourceInstance?: string;
  onClose: () => void;
  onCreated: () => void;
}

type Intensity = 'soft' | 'moderate' | 'aggressive';
type ContextPreset = 'friend' | 'sales' | 'support' | 'love' | 'custom';

const INTENSITY_CONFIG: Record<Intensity, { label: string; initial: number; max: number; days: number; description: string; icon: string }> = {
  soft: {
    label: 'Suave',
    initial: 5,
    max: 80,
    days: 30,
    description: 'Ideal para chips novos. 5 msgs/dia → até 80/dia em 30 dias. Menor risco.',
    icon: '🌱',
  },
  moderate: {
    label: 'Moderado',
    initial: 8,
    max: 120,
    days: 21,
    description: 'Equilíbrio entre velocidade e segurança. 8 msgs/dia → até 120/dia em 21 dias.',
    icon: '🔥',
  },
  aggressive: {
    label: 'Agressivo',
    initial: 12,
    max: 150,
    days: 14,
    description: 'Para chips com algum histórico. 12 msgs/dia → até 150/dia em 14 dias. Maior risco.',
    icon: '⚡',
  },
};

const CONTEXT_PRESETS: Record<ContextPreset, { label: string; description: string; prompt: string; icon: React.ReactNode }> = {
  friend: {
    label: 'Amizade Casual',
    description: 'Conversas cotidianas informais sobre futebol, filmes, memes e planos. Ideal para maturação natural.',
    prompt: 'Simule uma conversa entre dois amigos brasileiros que conversam frequentemente pelo WhatsApp.\n\nCaracterísticas da conversa:\n- As conversas devem parecer totalmente naturais, espontâneas e humanas.\n- Fale sobre assuntos do dia a dia como trabalho, estudos, academia, futebol, videogames, séries, filmes, música, memes, redes sociais, tecnologia, comida, trânsito, família, viagens, compras e planos para o fim de semana.\n- Um amigo pode pedir opinião, contar novidades, fazer piadas ou simplesmente puxar assunto.\n- Utilize linguagem informal típica do Brasil.\n- Use gírias e abreviações comuns como vc, pq, blz, bora, fechou, kkk, rs, mano, véi, mds, aff, top, suave, tranquilo, demorou, tmj e outras quando fizer sentido.\n- Utilize emojis ocasionalmente (😂😅👍🔥🤝😁), mas sem exagerar.\n- As mensagens devem variar entre curtas ("kkkk", "bora", "vdd", "sério?") e mensagens mais completas.\n- Faça perguntas para manter a conversa fluindo naturalmente.\n- Nem toda mensagem precisa ser respondida imediatamente; algumas respostas podem acontecer minutos ou horas depois.\n- Às vezes um dos amigos envia uma figurinha, um GIF, um áudio, uma foto ou um vídeo (descreva apenas como "[figurinha]", "[GIF]", "[áudio de 12 segundos]", "[foto do almoço]" ou "[vídeo curto]").\n- Os assuntos devem mudar naturalmente ao longo da conversa, sem parecer um roteiro.\n- Evite repetir frases, perguntas ou padrões de resposta.\n- Nunca utilize respostas robóticas ou excessivamente educadas.\n- O objetivo é fazer a conversa parecer que duas pessoas reais estão usando o WhatsApp durante vários dias, com interações naturais, descontraídas e variadas.',
    icon: <MessageSquare size={20} />,
  },
  sales: {
    label: 'Comercial / Vendas',
    description: 'Simula um cliente perguntando sobre produtos, preços, descontos e formas de pagamento.',
    prompt: 'Simule uma conversa entre um cliente e uma empresa brasileira pelo WhatsApp de forma totalmente natural.\n\nCaracterísticas da conversa:\n- O cliente demonstra interesse em produtos ou serviços, faz perguntas, pede preços, descontos, formas de pagamento, garantia, prazo de entrega ou disponibilidade.\n- O vendedor responde de forma educada, prestativa e profissional, tentando entender a necessidade do cliente antes de oferecer soluções.\n- Inclua negociações ocasionais sobre descontos, parcelamento, PIX, frete ou brindes.\n- O cliente pode comparar produtos, pedir recomendações ou dizer que vai pensar antes de comprar.\n- Utilize linguagem informal e comum do WhatsApp.\n- Use abreviações como vc, pq, blz, kkk, rs, tranquilo, fechou, combinado.\n- Utilize emojis ocasionalmente (😊👍📦💰🔥), sem exagerar.\n- As mensagens devem variar entre curtas e longas.\n- Faça perguntas naturais para manter a conversa fluindo.\n- Evite respostas automáticas ou repetitivas.\n- O objetivo é parecer uma conversa real entre um vendedor e um cliente durante vários dias, incluindo retornos do cliente após algumas horas ou dias para concluir a compra.',
    icon: <Briefcase size={20} />,
  },
  support: {
    label: 'Suporte Técnico',
    description: 'Simula um cliente pedindo ajuda com problemas em um serviço ou produto de pós-venda.',
    prompt: 'Simule uma conversa entre um cliente e o suporte técnico de uma empresa pelo WhatsApp.\n\nCaracterísticas da conversa:\n- O cliente relata dúvidas, dificuldades ou problemas reais relacionados a um produto ou serviço.\n- O atendente responde de forma educada, paciente and objetiva, fazendo perguntas para entender o problema antes de sugerir soluções.\n- O cliente pode enviar informações como modelo do aparelho, prints, fotos ou vídeos (descreva apenas como "[print da tela]" ou "[foto do erro]").\n- Inclua mensagens como "já reiniciei", "continua igual", "agora funcionou", "obrigado", etc.\n- Utilize linguagem natural do WhatsApp.\n- Use abreviações como vc, pq, blz, rs, kkk quando fizer sentido.\n- Utilize emojis discretamente (👍😊🔧📱).\n- Alterne mensagens curtas e detalhadas.\n- Evite repetir problemas ou soluções.\n- O suporte nunca responde de forma robótica; sempre demonstra empatia e procura ajudar.\n- O objetivo é simular um atendimento humano e realista até a resolução do problema.',
    icon: <HelpCircle size={20} />,
  },
  love: {
    label: 'Namorados',
    description: 'Simula um casal trocando mensagens do dia a dia, com termos de carinho e gírias de forma natural.',
    prompt: 'Simule uma conversa entre dois namorados brasileiros que já estão juntos há algum tempo. As mensagens devem parecer totalmente naturais, espontâneas e humanas.\n\nCaracterísticas da conversa:\n- Assuntos do dia a dia (trabalho, estudos, comida, séries, filmes, música, memes, família, pets, planos para o fim de semana, viagens, academia, sono, compras etc.).\n- Demonstrações de carinho como "amor", "vida", "mozão", "lindo(a)", "saudade", "bom dia", "boa noite", "dorme bem", "te amo", mas sem exagerar.\n- Às vezes um responde rápido, outras demora alguns minutos ou horas.\n- Algumas mensagens curtas ("kkk", "sério?", "mds", "tô indo", "já já"), outras mais longas.\n- Use gírias brasileiras e abreviações comuns do WhatsApp (vc, pq, tbm, né, kkk, rs, mds, aff).\n- Inclua emojis ocasionalmente (❤️🥰😂😘🤍😊), mas não em todas as mensagens.\n- Faça perguntas naturais para manter a conversa fluindo.\n- Evite repetir assuntos ou padrões.\n- Às vezes um manda foto (descreva apenas como "[foto do almoço]" ou "[selfie sorrindo]"), áudio ("[áudio de 18 segundos]") ou figurinha ("[figurinha rindo]").\n- O casal nunca fala de política, golpes, apostas ou temas sensíveis.\n- O objetivo é parecer uma conversa real entre um casal apaixonado vivendo a rotina normal.\n\nA conversa deve evoluir naturalmente ao longo dos dias, alternando horários (manhã, tarde e noite), mantendo continuidade entre os assuntos e sem parecer roteirizada. Importante:\n- Nunca envie muitas mensagens seguidas sem resposta.\n- Alterne quem inicia a conversa.\n- Em alguns dias converse bastante e em outros apenas algumas mensagens.\n- Crie pausas naturais entre as mensagens.\n- Não reutilize frases prontas.\n- Faça parecer que duas pessoas reais estão usando o WhatsApp normalmente.',
    icon: <Heart size={20} />,
  },
  custom: {
    label: 'Personalizado',
    description: 'Escreva seu próprio prompt para definir exatamente o comportamento da Inteligência Artificial.',
    prompt: 'Você é responsável por simular conversas extremamente humanas entre duas pessoas no WhatsApp.\n\nSiga exatamente as instruções abaixo para definir o comportamento da conversa.\n\nPERSONAS:\n[Descreva quem são os participantes.]\n\nOBJETIVO DA CONVERSA:\n[Explique qual é o contexto da conversa.]\n\nESTILO:\n- Natural e espontâneo.\n- Linguagem brasileira.\n- Mensagens variadas.\n- Uso moderado de gírias.\n- Emojis ocasionais.\n- Perguntas naturais.\n- Sem parecer uma IA.\n\nCOMPORTAMENTO:\n- Nem todas as mensagens precisam receber resposta imediata.\n- Alterne mensagens curtas e longas.\n- Inclua pausas naturais entre as conversas.\n- Evite repetir frases.\n- Os participantes podem enviar áudios, fotos, figurinhas e GIFs (descrevendo apenas como "[áudio]", "[foto]", "[figurinha]" ou "[GIF]").\n- Os assuntos devem evoluir naturalmente.\n- Nunca gere mensagens idênticas ou padronizadas.\n- Faça a conversa parecer uma troca real entre duas pessoas durante dias ou semanas.',
    icon: <Settings size={20} />,
  },
};

export default function CreateWarmupModal({ initialSourceInstance, onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [instances, setInstances] = useState<{ name: string; status: string; phone?: string | null }[]>([]);

  // Form fields
  const [name, setName] = useState('');
  const [sourceInstance, setSourceInstance] = useState(initialSourceInstance || '');
  const [targetInstance, setTargetInstance] = useState('');
  
  // Modes toggles
  const [enableChat, setEnableChat] = useState(true);
  const [enableStatus, setEnableStatus] = useState(false);
  const [enableGroup, setEnableGroup] = useState(false);

  // Modos configs
  const [targetPhonesInput, setTargetPhonesInput] = useState('');
  const [statusFrequency, setStatusFrequency] = useState(2);
  const [statusType, setStatusType] = useState<'text' | 'image' | 'random'>('random');
  const [targetGroupInput, setTargetGroupInput] = useState('');

  const [contextPreset, setContextPreset] = useState<ContextPreset>('friend');
  const [customContextInput, setCustomContextInput] = useState(
    'Você é responsável por simular conversas extremamente humanas entre duas pessoas no WhatsApp.\n\nSiga exatamente as instruções abaixo para definir o comportamento da conversa.\n\nPERSONAS:\n[Descreva quem são os participantes.]\n\nOBJETIVO DA CONVERSA:\n[Explique qual é o contexto da conversa.]\n\nESTILO:\n- Natural e espontâneo.\n- Linguagem brasileira.\n- Mensagens variadas.\n- Uso moderado de gírias.\n- Emojis ocasionais.\n- Perguntas naturais.\n- Sem parecer uma IA.\n\nCOMPORTAMENTO:\n- Nem todas as mensagens precisam receber resposta imediata.\n- Alterne mensagens curtas e longas.\n- Inclua pausas naturais entre as conversas.\n- Evite repetir frases.\n- Os participantes podem enviar áudios, fotos, figurinhas e GIFs (descrevendo apenas como "[áudio]", "[foto]", "[figurinha]" ou "[GIF]").\n- Os assuntos devem evoluir naturalmente.\n- Nunca gere mensagens idênticas ou padronizadas.\n- Faça a conversa parecer uma troca real entre duas pessoas durante dias ou semanas.'
  );
  const [intensity, setIntensity] = useState<Intensity>('soft');
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(22);
  const [error, setError] = useState('');
  const [groups, setGroups] = useState<{ id: string; subject: string }[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [showManualJid, setShowManualJid] = useState(false);

  useEffect(() => {
    // Buscar instâncias conectadas
    fetch('/api/whatsapp/connect')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.instances || [];
        setInstances(list.filter((i: any) => i.status === 'CONNECTED'));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (enableGroup && sourceInstance) {
      setLoadingGroups(true);
      setError('');
      setTargetGroupInput('');
      setGroups([]);
      setShowManualJid(false);
      fetch(`/api/whatsapp/instances/${sourceInstance}/groups`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setGroups(data.groups || []);
            // Se não encontrar grupos, ativa o manual por padrão
            if (!data.groups || data.groups.length === 0) {
              setShowManualJid(true);
            }
          } else {
            setError(data.error || 'Erro ao carregar os grupos desta instância.');
            setShowManualJid(true);
          }
        })
        .catch(() => {
          setError('Erro de conexão ao buscar grupos.');
          setShowManualJid(true);
        })
        .finally(() => {
          setLoadingGroups(false);
        });
    } else {
      setGroups([]);
    }
  }, [enableGroup, sourceInstance]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!sourceInstance) {
      setError('Instância de origem é obrigatória.');
      return;
    }

    if (!enableChat && !enableGroup && !enableStatus && !targetInstance) {
      setError('Selecione pelo menos um modo de aquecimento.');
      return;
    }

    let phonesList: string[] = [];

    if (targetInstance) {
      const targetInstObj = instances.find(i => i.name === targetInstance);
      if (targetInstObj?.phone) {
        phonesList.push(targetInstObj.phone);
      } else {
        setError('A instância de resposta selecionada não possui um número de telefone registrado.');
        return;
      }
    }

    if (enableChat) {
      // Processa e limpa os telefones de destino (aceita quebras de linha, espaços, vírgulas ou ponto e vírgula como separadores)
      const chatPhones = targetPhonesInput
        .split(/[\s,;]+/)
        .map(p => p.replace(/\D/g, ''))
        .filter(Boolean);

      if (chatPhones.length === 0 && !targetInstance) {
        setError('Insira pelo menos um telefone de destino válido.');
        return;
      }
      phonesList.push(...chatPhones);
    }

    if (enableGroup) {
      const gJid = targetGroupInput.trim();
      if (!gJid || !gJid.endsWith('@g.us')) {
        setError('Por favor, informe um JID de grupo válido (deve terminar com @g.us).');
        return;
      }
      phonesList.push(gJid);
    }

    if (enableStatus && phonesList.length === 0) {
      // Se apenas o modo status estiver ativado, criamos uma campanha com identificador dummy
      phonesList.push('STATUS');
    }

    if (startHour >= endHour) {
      setError('Hora de início deve ser menor que hora de fim.');
      return;
    }

    const selectedPreset = CONTEXT_PRESETS[contextPreset];
    const finalContext = contextPreset === 'custom' ? customContextInput : selectedPreset.prompt;

    if (contextPreset === 'custom' && !customContextInput.trim()) {
      setError('Por favor, escreva a instrução da sua persona personalizada.');
      return;
    }

    setLoading(true);
    const config = INTENSITY_CONFIG[intensity];

    try {
      const res = await fetch('/api/warmup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || undefined,
          sourceInstance,
          targetInstance: targetInstance || null,
          targetPhone: phonesList[0],
          targetPhones: phonesList.join(','),
          customContext: finalContext,
          isGroup: false, // Backend resolverá o isGroup de cada campanha
          totalDays: config.days,
          initialMsgsPerDay: config.initial,
          maxMsgsPerDay: config.max,
          startHour,
          endHour,
          enableStatus,
          statusFrequency,
          statusType,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        onCreated();
      } else {
        setError(data.error || 'Erro ao criar campanha de aquecimento.');
      }
    } catch (err) {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const selectedConfig = INTENSITY_CONFIG[intensity];

  return (
    <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)', zIndex: 1000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div className="modal-content" style={{ width: '100%', maxWidth: '620px', background: 'linear-gradient(145deg, #0f172a, #0b0f19)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px', padding: '1.75rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
        
        {/* Header */}
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px rgba(245, 158, 11, 0.3)',
            }}>
              <Flame size={20} color="white" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#fff', fontWeight: 800 }}>Configurar Aquecimento</h2>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)' }}>
                Simulação de Comportamento Humano Avançada • Passo {step} de 2
              </p>
            </div>
          </div>
          <button type="button" className="btn-close" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '50%', padding: '6px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}><X size={20} /></button>
        </div>

        {/* Steps Progress bar */}
        <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', marginBottom: '1.5rem', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${step * 50}%`,
            background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
            borderRadius: '4px',
            transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 0 8px rgba(245, 158, 11, 0.5)',
          }} />
        </div>

        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              {/* Nome */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: '0.4rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Nome do Ciclo
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Maturação Chip Principal"
                  style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', color: '#fff', outline: 'none' }}
                />
              </div>

              {/* Grid Instâncias */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* Instância Origem */}
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: '0.4rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Origem (Instância) *
                  </label>
                  {instances.length > 0 ? (
                    <select
                      className="form-input"
                      value={sourceInstance}
                      onChange={e => setSourceInstance(e.target.value)}
                      required
                      style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', color: '#fff', outline: 'none' }}
                    >
                      <option value="" style={{ background: '#0b0f19' }}>Selecione...</option>
                      {instances.map(inst => (
                        <option key={inst.name} value={inst.name} style={{ background: '#0b0f19' }}>
                          {inst.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={sourceInstance}
                      onChange={e => setSourceInstance(e.target.value)}
                      placeholder="Ex: wajato-session-1"
                      style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', color: '#fff', outline: 'none' }}
                    />
                  )}
                </div>

                {/* Instância Destino (opcional) */}
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: '0.4rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Resposta (Bidirecional)
                  </label>
                  {instances.length > 1 ? (
                    <select
                      className="form-input"
                      value={targetInstance}
                      onChange={e => setTargetInstance(e.target.value)}
                      style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', color: '#fff', outline: 'none' }}
                    >
                      <option value="" style={{ background: '#0b0f19' }}>Sem resposta (Unidirecional)</option>
                      {instances.filter(i => i.name !== sourceInstance).map(inst => (
                        <option key={inst.name} value={inst.name} style={{ background: '#0b0f19' }}>
                          {inst.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-input"
                      value={targetInstance}
                      onChange={e => setTargetInstance(e.target.value)}
                      placeholder="Ex: wajato-session-2 (opcional)"
                      style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', color: '#fff', outline: 'none' }}
                    />
                  )}
                </div>
              </div>

              {/* Modos de Aquecimento (Checkboxes) */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: '0.5rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Modos de Aquecimento
                </label>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Conversar com Contatos */}
                  <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 700, color: '#fff', fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={enableChat}
                        onChange={e => setEnableChat(e.target.checked)}
                        style={{ accentColor: '#f59e0b', width: '16px', height: '16px' }}
                      />
                      💬 Conversar com Contatos Externos (1 a 10 números)
                    </label>
                    
                    {enableChat && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.3rem', display: 'block' }}>
                          Lista de números de destino (um por linha com DDI, ex: 5511999999999)
                        </label>
                        <textarea
                          className="form-input"
                          required={enableChat}
                          rows={3}
                          value={targetPhonesInput}
                          onChange={e => setTargetPhonesInput(e.target.value)}
                          placeholder="5511999999999&#10;5511888888888&#10;5511777777777"
                          style={{ width: '100%', padding: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#fff', outline: 'none', fontFamily: 'monospace', resize: 'vertical', fontSize: '0.82rem' }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Postar Status/Stories */}
                  <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 700, color: '#fff', fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={enableStatus}
                        onChange={e => setEnableStatus(e.target.checked)}
                        style={{ accentColor: '#f59e0b', width: '16px', height: '16px' }}
                      />
                      📖 Postar Status / Stories (com Imagens e Texto)
                    </label>
                    
                    {enableStatus && (
                      <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.3rem', display: 'block' }}>
                            Frequência (Postagens / Dia)
                          </label>
                          <select
                            className="form-input"
                            value={statusFrequency}
                            onChange={e => setStatusFrequency(Number(e.target.value))}
                            style={{ width: '100%', padding: '0.55rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.8rem' }}
                          >
                            <option value={1} style={{ background: '#0b0f19' }}>1 vez por dia</option>
                            <option value={2} style={{ background: '#0b0f19' }}>2 vezes por dia</option>
                            <option value={3} style={{ background: '#0b0f19' }}>3 vezes por dia</option>
                            <option value={5} style={{ background: '#0b0f19' }}>5 vezes por dia</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.3rem', display: 'block' }}>
                            Tipo de Conteúdo
                          </label>
                          <select
                            className="form-input"
                            value={statusType}
                            onChange={e => setStatusType(e.target.value as any)}
                            style={{ width: '100%', padding: '0.55rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.8rem' }}
                          >
                            <option value="text" style={{ background: '#0b0f19' }}>Apenas texto</option>
                            <option value="image" style={{ background: '#0b0f19' }}>Texto + Imagens</option>
                            <option value="random" style={{ background: '#0b0f19' }}>Aleatório (Texto e Mídia)</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Participar de Grupo */}
                  <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 700, color: '#fff', fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={enableGroup}
                        onChange={e => setEnableGroup(e.target.checked)}
                        style={{ accentColor: '#f59e0b', width: '16px', height: '16px' }}
                      />
                      👥 Participar de Grupo de WhatsApp
                    </label>
                    
                    {enableGroup && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                            Grupo de Destino
                          </label>
                          {sourceInstance && (
                            <button
                              type="button"
                              onClick={() => setShowManualJid(!showManualJid)}
                              style={{ background: 'none', border: 'none', color: '#f59e0b', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                            >
                              {showManualJid ? 'Selecionar da Lista' : 'Digitar JID Manual'}
                            </button>
                          )}
                        </div>

                        {!sourceInstance ? (
                          <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px', color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', textAlign: 'center' }}>
                            ⚠️ Selecione uma Instância de Origem conectada primeiro.
                          </div>
                        ) : loadingGroups ? (
                          <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                            <span className="spinner" style={{ width: '10px', height: '10px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#f59e0b', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
                            Buscando grupos no WhatsApp...
                          </div>
                        ) : showManualJid ? (
                          <input
                            type="text"
                            className="form-input"
                            required={enableGroup}
                            value={targetGroupInput}
                            onChange={e => setTargetGroupInput(e.target.value)}
                            placeholder="Ex: 12036302839201@g.us"
                            style={{ width: '100%', padding: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.82rem' }}
                          />
                        ) : groups.length === 0 ? (
                          <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(239,68,68,0.2)', borderRadius: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', textAlign: 'center' }}>
                            Nenhum grupo encontrado nesta instância.
                            <button
                              type="button"
                              onClick={() => setShowManualJid(true)}
                              style={{ display: 'block', margin: '4px auto 0', background: '#f59e0b22', border: '1px solid #f59e0b44', color: '#f59e0b', fontSize: '0.7rem', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              Digitar JID Manualmente
                            </button>
                          </div>
                        ) : (
                          <select
                            className="form-input"
                            value={targetGroupInput}
                            onChange={e => setTargetGroupInput(e.target.value)}
                            required={enableGroup}
                            style={{ width: '100%', padding: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.82rem' }}
                          >
                            <option value="" style={{ background: '#0b0f19' }}>Selecione um grupo...</option>
                            {groups.map(g => (
                              <option key={g.id} value={g.id} style={{ background: '#0b0f19' }}>
                                👥 {g.subject}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {error && (
                <div style={{ color: '#ef4444', fontSize: '0.82rem', padding: '0.65rem 0.85rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px' }}>
                  ⚠️ {error}
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: '0.5rem', width: '100%', padding: '0.85rem', fontWeight: 700, background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: '10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}
                onClick={() => {
                  if (!sourceInstance) {
                    setError('Selecione a instância de origem.');
                    return;
                  }
                  if (!enableChat && !enableGroup && !enableStatus && !targetInstance) {
                    setError('Selecione pelo menos um modo de aquecimento.');
                    return;
                  }
                  if (enableChat && !targetPhonesInput.trim()) {
                    setError('Informe os telefones de destino.');
                    return;
                  }
                  if (enableGroup && !targetGroupInput.trim()) {
                    setError('Informe o JID do Grupo.');
                    return;
                  }
                  if (enableGroup && !targetGroupInput.trim().endsWith('@g.us')) {
                    setError('O JID do grupo deve terminar com @g.us');
                    return;
                  }
                  setStep(2);
                  setError('');
                }}
              >
                Configurar Persona & Horários →
              </button>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Seletor de Persona/Contexto */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: '0.6rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Contexto de Conversa & Persona IA
                </label>
                
                {/* Grid de Presets */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.75rem' }}>
                  {(Object.entries(CONTEXT_PRESETS) as [ContextPreset, typeof CONTEXT_PRESETS[ContextPreset]][]).map(([key, item]) => {
                    const isSelected = contextPreset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setContextPreset(key)}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.6rem',
                          padding: '0.75rem',
                          borderRadius: '12px',
                          border: `2px solid ${isSelected ? '#f59e0b' : 'rgba(255,255,255,0.06)'}`,
                          background: isSelected ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255,255,255,0.02)',
                          color: isSelected ? '#fff' : 'rgba(255,255,255,0.65)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div style={{
                          color: isSelected ? '#f59e0b' : 'rgba(255,255,255,0.4)',
                          marginTop: '2px',
                        }}>
                          {item.icon}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: isSelected ? '#f59e0b' : '#fff' }}>{item.label}</span>
                          <span style={{ fontSize: '0.65rem', lineHeight: '1.2', opacity: 0.85 }}>{item.description}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Editor Customizado ou Detalhe do Preset */}
                {contextPreset === 'custom' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <textarea
                      className="form-input"
                      required
                      rows={3}
                      value={customContextInput}
                      onChange={e => setCustomContextInput(e.target.value)}
                      placeholder="Ex: Você é um cliente interessado em alugar um imóvel. Faça perguntas sobre número de quartos, valor do condomínio, se aceita pet, agende uma visita..."
                      style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', outline: 'none', fontSize: '0.82rem', resize: 'vertical' }}
                    />
                    <small style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem' }}>
                      Escreva em detalhes quem a IA deve simular e quais assuntos ela deve trazer na conversa.
                    </small>
                  </div>
                ) : (
                  <div style={{
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '10px',
                    fontSize: '0.75rem',
                    color: 'rgba(255,255,255,0.5)',
                    lineHeight: '1.4',
                  }}>
                    <strong style={{ color: '#fff', marginRight: 4 }}>Prompt Enviado:</strong>
                    "{CONTEXT_PRESETS[contextPreset].prompt}"
                  </div>
                )}
              </div>

              {/* Intensidade */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: '0.6rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Intensidade do Aquecimento
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(Object.entries(INTENSITY_CONFIG) as [Intensity, typeof INTENSITY_CONFIG[Intensity]][]).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setIntensity(key)}
                      style={{
                        flex: 1,
                        padding: '0.65rem 0.5rem',
                        border: `2px solid ${intensity === key ? '#ef4444' : 'rgba(255,255,255,0.06)'}`,
                        borderRadius: '10px',
                        background: intensity === key ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255,255,255,0.02)',
                        color: intensity === key ? '#ef4444' : 'rgba(255,255,255,0.6)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                    >
                      <span style={{ fontSize: '1.1rem' }}>{cfg.icon}</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: intensity === key ? '#ef4444' : '#fff' }}>{cfg.label}</span>
                      <span style={{ fontSize: '0.62rem', opacity: 0.7 }}>{cfg.days} dias</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Horário e Janela */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Clock size={14} /> Janela Ativa (Horário Comercial)
                </label>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <select
                      className="form-input"
                      value={startHour}
                      onChange={e => setStartHour(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', outline: 'none' }}
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i} style={{ background: '#0b0f19' }}>Das {String(i).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>até as</span>
                  <div style={{ flex: 1 }}>
                    <select
                      className="form-input"
                      value={endHour}
                      onChange={e => setEndHour(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', outline: 'none' }}
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i} style={{ background: '#0b0f19' }}>{String(i).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Resumo */}
              <div style={{
                padding: '0.85rem 1rem',
                background: 'rgba(16, 185, 129, 0.04)',
                border: '1px solid rgba(16, 185, 129, 0.12)',
                borderRadius: '12px',
                fontSize: '0.78rem',
              }}>
                <div style={{ fontWeight: 700, color: '#10b981', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <TrendingUp size={14} /> Resumo do Ramp-Up Progressivo
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem', color: 'rgba(255,255,255,0.6)' }}>
                  <span>📅 Duração: <strong style={{ color: '#fff' }}>{selectedConfig.days} dias</strong></span>
                  <span>🚀 Início: <strong style={{ color: '#fff' }}>{selectedConfig.initial} msgs/dia</strong></span>
                  <span>🏆 Máximo: <strong style={{ color: '#fff' }}>{selectedConfig.max} msgs/dia</strong></span>
                  <span>⏰ Janela: <strong style={{ color: '#fff' }}>{startHour}h–{endHour}h (BRT)</strong></span>
                </div>
              </div>

              {error && (
                <div style={{ color: '#ef4444', fontSize: '0.82rem', padding: '0.65rem 0.85rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px' }}>
                  ⚠️ {error}
                </div>
              )}

              {/* Botoes de Acao */}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep(1)} style={{ flex: 1, padding: '0.85rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ← Voltar
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 2, padding: '0.85rem', fontWeight: 700, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', border: 'none', borderRadius: '10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 4px 15px rgba(245, 158, 11, 0.25)' }}>
                  {loading ? (
                    <>
                      <Zap size={15} />
                      Iniciando ciclo...
                    </>
                  ) : (
                    <>
                      <Flame size={15} />
                      Iniciar Aquecimento
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
