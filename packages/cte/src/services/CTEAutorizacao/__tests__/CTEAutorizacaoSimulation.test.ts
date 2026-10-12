jest.mock('../../util/CTeSchema.js', () => ({ validarXmlCte: jest.fn().mockResolvedValue(undefined) }));
import { CTEAutorizacaoService } from '../CTEAutorizacaoService.js';
import pako from 'pako';

describe('simulação interna de autorização CT-e', () => {
    it('monta assinatura de teste, QR Code, validação, GZip/Base64 e interpreta cStat 100 simulado', async () => {
        const ambiente = {
            config: { dfe: { UF: 'GO' } },
            getConfig: () => ({ dfe: { UF: 'GO' }, nfe: { ambiente: 2 } }),
        };
        const xmlBuilder = {
            gerarXml: jest.fn(() => '<CTe xmlns="http://www.portalfiscal.inf.br/cte"><infCte Id="fixture"></infCte></CTe>'),
            assinarXML: jest.fn((xml: string) => xml.replace('</CTe>', '<Signature>assinatura-ficticia</Signature></CTe>')),
        };
        const xmlCompactadoRecebido: string[] = [];
        const gerarConsulta = {
            gerarConsulta: jest.fn(async (xml: string) => {
                xmlCompactadoRecebido.push(xml);
                return { xmlFormated: '<soap>resposta simulada</soap>', agent: {}, webServiceUrl: 'https://simulador.invalid/CTeRecepcaoSincV4', action: 'urn:CTeRecepcaoSincV4' };
            }),
        };
        const service = new CTEAutorizacaoService(
            ambiente as any,
            {
                verificaRejeicao: jest.fn(() => ({ protCTe: { infProt: { cStat: '100', xMotivo: 'Autorizado no simulador', chCTe: 'chave-ficticia' } } })),
                salvaConsulta: jest.fn(),
                salvaRetorno: jest.fn(),
            } as any,
            xmlBuilder as any,
            { post: jest.fn().mockResolvedValue({ data: '<retCTe>resposta fictícia</retCTe>' }) } as any,
            {} as any,
            gerarConsulta as any,
        );

        const resultado = await service.Exec({
            CTe: {
                infCte: {
                    ide: {
                        cUF: 52, dhEmi: '2026-10-09T18:00:00-03:00', tpAmb: 2, mod: 57,
                        serie: 1, nCT: 1, tpEmis: 1, cCT: '00000001',
                    },
                    emit: { CNPJCPF: '11222333000181', xNome: 'Transportadora Fictícia' },
                },
            } as any,
        });

        const xmlTransmitido = pako.ungzip(Buffer.from(xmlCompactadoRecebido[0], 'base64'), { to: 'string' });
        expect(resultado.success).toBe(true);
        expect(resultado.xMotivo[0]).toMatchObject({ cStat: '100', xMotivo: 'Autorizado no simulador' });
        expect(xmlTransmitido).toContain('https://dfe-portal.svrs.rs.gov.br/cte/qrCode?chCTe=');
        expect(xmlTransmitido).toContain('&amp;tpAmb=2');
        expect(xmlTransmitido.indexOf('</infCte>')).toBeLessThan(xmlTransmitido.indexOf('<infCTeSupl>'));
        expect(xmlTransmitido.indexOf('<infCTeSupl>')).toBeLessThan(xmlTransmitido.indexOf('<Signature>'));
    });
});
