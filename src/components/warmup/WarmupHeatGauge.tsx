'use client';

import React from 'react';

interface Props {
  score: number; // 0-100
  size?: number;
}

/**
 * Componente visual de Heat Score — termômetro circular SVG.
 * Mostra o nível de aquecimento estimado de 0 a 100.
 */
export default function WarmupHeatGauge({ score, size = 80 }: Props) {
  const clampedScore = Math.max(0, Math.min(100, score));
  
  // Calcula a cor baseada no score (frio → quente)
  const getColor = (s: number): string => {
    if (s < 20) return '#3b82f6';  // Azul — frio
    if (s < 40) return '#06b6d4';  // Ciano — morno
    if (s < 60) return '#10b981';  // Verde — aquecendo
    if (s < 80) return '#f59e0b';  // Amarelo — quente
    return '#ef4444';              // Vermelho — muito quente
  };

  const getLabel = (s: number): string => {
    if (s < 20) return 'Frio';
    if (s < 40) return 'Morno';
    if (s < 60) return 'Aquecendo';
    if (s < 80) return 'Quente';
    return 'Máximo';
  };

  const color = getColor(clampedScore);
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  // Arc de 270 graus (¾ do círculo)
  const arcLength = circumference * 0.75;
  const progress = (clampedScore / 100) * arcLength;
  const strokeDashoffset = arcLength - progress;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg
          width={size}
          height={size}
          style={{ transform: 'rotate(135deg)', overflow: 'visible' }}
        >
          {/* Track background */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={6}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.8s ease, stroke 0.5s ease',
              filter: `drop-shadow(0 0 4px ${color}80)`,
            }}
          />
        </svg>
        {/* Score no centro */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}>
          <span style={{ fontSize: size * 0.22, fontWeight: 800, color, lineHeight: 1 }}>
            {clampedScore}
          </span>
          <span style={{ fontSize: size * 0.12, color: 'rgba(255,255,255,0.5)', lineHeight: 1 }}>
            /100
          </span>
        </div>
      </div>
      <span style={{ fontSize: '0.7rem', color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {getLabel(clampedScore)}
      </span>
    </div>
  );
}
