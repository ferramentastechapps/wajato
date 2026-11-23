module.exports = {
  apps: [
    {
      name: 'wajato-web',
      script: './node_modules/next/dist/bin/next',
      args: 'start',
      windowsHide: true,
      autorestart: true,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'wajato-worker',
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'src/workers/message-worker.ts',
      windowsHide: true,
      autorestart: true,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
