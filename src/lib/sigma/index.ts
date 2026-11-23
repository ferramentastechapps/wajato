export * from './types';
export * from './errors';
export * from './webhook';
export * from './client';

import { SigmaClient } from './client';

/**
 * Default singleton instance of SigmaClient initialized from environment variables.
 */
export const sigma = new SigmaClient();
