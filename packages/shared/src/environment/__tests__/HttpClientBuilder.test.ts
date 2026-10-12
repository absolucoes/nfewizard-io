import https from 'https';
import { AxiosHttpClient } from '../AxiosHttpClient';
import { HttpClientBuilder } from '../HttpClientBuilder';

describe('HttpClientBuilder', () => {
  // Regressão: o builder passava `httpsAgent`, mas o AxiosHttpClient lê `agent` (HttpClientConfig).
  // O axios saía sem o agente com as CAs e o MDF-e falhava no TLS da SVRS ("unable to get local issuer certificate").
  it('entrega o agente TLS ao axios criado', () => {
    const agent = new https.Agent();
    const builder = new HttpClientBuilder({ lib: { connection: { timeout: 1000 } } } as any, agent, new AxiosHttpClient());

    const cliente = builder.createHttpClient();

    expect(cliente.defaults.httpsAgent).toBe(agent);
  });
});
