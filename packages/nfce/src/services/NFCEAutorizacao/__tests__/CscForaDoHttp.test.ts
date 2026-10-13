/*
 * Fork Vanir: o CSC é segredo do contribuinte e só entra no hash do QR Code. A lib o mandava no header HTTP
 * da autorização e logava o header inteiro em `logger.http`. Este teste falha se o CSC voltar ao header,
 * ao corpo da requisição ou a qualquer chamada do logger durante a comunicação com o webservice.
 */
import { logger } from '@nfewizard/shared';

const NFCEAutorizacaoService = require('../NFCEAutorizacaoService').NFCEAutorizacaoService;

const CSC_FICTICIO = 'CSC-FICTICIO-DO-TESTE-0001';

function montarServico(post: jest.Mock) {
    const environment = {
        getConfig: () => ({
            dfe: { ambiente: 2, UF: 'GO', baixarXMLDistribuicao: false },
            nfe: { ambiente: 2, versaoDF: '4.00', idCSC: 1, tokenCSC: CSC_FICTICIO },
            lib: {},
        }),
    };
    const axios = { post };
    return new NFCEAutorizacaoService(environment, {}, {}, axios, {}, {});
}

describe('NFCEAutorizacaoService - o CSC não sai pelo HTTP nem pelo log', () => {
    let espioes: jest.SpyInstance[];

    beforeEach(() => {
        espioes = (['http', 'info', 'warn', 'error', 'debug'] as const)
            .filter((nivel) => typeof (logger as any)[nivel] === 'function')
            .map((nivel) => jest.spyOn(logger as any, nivel).mockImplementation(() => undefined as any));
    });

    afterEach(() => {
        espioes.forEach((espiao) => espiao.mockRestore());
    });

    it('callWebService não põe o CSC no header nem no corpo', async () => {
        const post = jest.fn().mockResolvedValue({ data: '<retEnviNFe/>' });
        const servico = montarServico(post);

        await servico['callWebService']('<enviNFe/>', 'https://exemplo.invalid/NFeAutorizacao4', 'application/soap+xml', 'acao', {});

        expect(post).toHaveBeenCalledTimes(1);
        const [, corpo, opcoes] = post.mock.calls[0];
        expect(JSON.stringify(opcoes.headers)).not.toContain(CSC_FICTICIO);
        expect(Object.keys(opcoes.headers).map((k) => k.toLowerCase())).not.toContain('csc');
        expect(String(corpo)).not.toContain(CSC_FICTICIO);
    });

    it('nenhuma chamada do logger durante a comunicação leva o CSC', async () => {
        const post = jest.fn().mockResolvedValue({ data: '<retEnviNFe/>' });
        const servico = montarServico(post);

        await servico['callWebService']('<enviNFe/>', 'https://exemplo.invalid/NFeAutorizacao4', 'application/soap+xml', 'acao', {});

        const chamadas = espioes.flatMap((espiao) => espiao.mock.calls);
        expect(chamadas.length).toBeGreaterThan(0);
        for (const argumentos of chamadas) {
            expect(JSON.stringify(argumentos)).not.toContain(CSC_FICTICIO);
        }
    });
});
