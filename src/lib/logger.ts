/**
 * logger.ts
 * Utilitário de logging estruturado de alta performance para o WaJato.
 * Em produção, gera saída formatada em JSON (compatível com Loki/Datadog).
 * Em desenvolvimento, gera saída colorida e legível no console.
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

class Logger {
  private isProd = process.env.NODE_ENV === 'production';

  private log(level: LogLevel, message: string, meta?: Record<string, any>) {
    const timestamp = new Date().toISOString();

    if (this.isProd) {
      // Formato JSON estruturado para produção
      console.log(
        JSON.stringify({
          timestamp,
          level,
          message,
          ...meta,
        })
      );
    } else {
      // Formato legível para desenvolvimento local com cores básicas no console
      const colors = {
        DEBUG: '\x1b[36m', // Cyan
        INFO: '\x1b[32m',  // Green
        WARN: '\x1b[33m',  // Yellow
        ERROR: '\x1b[31m', // Red
      };
      const reset = '\x1b[0m';
      const color = colors[level] || reset;

      const metaString = meta && Object.keys(meta).length > 0
        ? ` ${JSON.stringify(meta)}`
        : '';

      console.log(
        `[${timestamp}] ${color}[${level}]${reset} ${message}${metaString}`
      );
    }
  }

  public debug(message: string, meta?: Record<string, any>) {
    this.log('DEBUG', message, meta);
  }

  public info(message: string, meta?: Record<string, any>) {
    this.log('INFO', message, meta);
  }

  public warn(message: string, meta?: Record<string, any>) {
    this.log('WARN', message, meta);
  }

  public error(message: string, meta?: Record<string, any> | Error) {
    if (meta instanceof Error) {
      this.log('ERROR', message, {
        error: meta.message,
        stack: meta.stack,
      });
    } else {
      this.log('ERROR', message, meta);
    }
  }
}

export const logger = new Logger();
