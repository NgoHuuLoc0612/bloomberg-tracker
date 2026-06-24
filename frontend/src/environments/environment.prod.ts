export const environment = {
  production:   true,
  apiUrl:       '/api/v1',
  wsUrl:        `wss://${typeof window !== 'undefined' ? window.location.host : 'localhost'}/ws`,
  appName:      'Bloomberg Tracker',
  version:      '1.0.0',
};
