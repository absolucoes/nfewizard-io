jest.mock('../util/CTeSchema.js', () => ({ validarXmlCte: jest.fn().mockResolvedValue(undefined) }));
import { CTEEventoCancCCeService } from './CTEEventoCancCCeService.js';

describe('CTEEventoCancCCeService', () => {
    it('recusa justificativa de cancelamento fora do tamanho legal antes de assinar', async () => {
        const service = new CTEEventoCancCCeService(
            { getConfig: () => ({ dfe: { UF: 'GO' }, nfe: { ambiente: 2 } }) } as any,
            {} as any, {} as any, {} as any, {} as any, {} as any,
        );
        await expect(service['gerarEvento']({
            chCTe: '52261012ABC34501DE35570010000000011123456787',
            cOrgao: 52,
            CNPJ: '11222333000181',
            nProt: '152260000000001',
            xJust: 'curta',
        }, '110111')).rejects.toThrow('CTE_CANCELAMENTO_JUSTIFICATIVA_INVALIDA');
    });

    it('monta o Id de evento com sequência de três dígitos e assina infEvento', async () => {
        const xmlBuilder = {
            gerarXml: jest.fn((_xml: any) => '<eventoCTe/>'),
            assinarXML: jest.fn((xml: string, _tag: string) => xml + '<Signature/>'),
        };
        const service = new CTEEventoCancCCeService(
            { getConfig: () => ({ dfe: { UF: 'GO' }, nfe: { ambiente: 2 } }) } as any,
            {} as any, xmlBuilder as any, {} as any, {} as any, {} as any,
        );
        const xml = await service['gerarEvento']({
            chCTe: '52261012ABC34501DE35570010000000011123456787',
            cOrgao: 52,
            CNPJ: '11222333000181',
            nProt: '152260000000001',
            xJust: 'Motivo de cancelamento fictício.',
        }, '110111');
        expect((xmlBuilder.gerarXml.mock.calls[1][0] as any).infEvento.$.Id).toBe(
            'ID11011152261012ABC34501DE35570010000000011123456787001',
        );
        expect(xmlBuilder.assinarXML).toHaveBeenCalledWith('<eventoCTe/>', 'infEvento');
        expect(xml).toContain('<Signature/>');
    });

    it('inclui infCorrecao e a condição de uso oficial na CC-e', async () => {
        const xmlBuilder = {
            gerarXml: jest.fn((xml: any) => JSON.stringify(xml)),
            assinarXML: jest.fn((xml: string) => xml),
        };
        const service = new CTEEventoCancCCeService(
            { getConfig: () => ({ dfe: { UF: 'GO' }, nfe: { ambiente: 2 } }) } as any,
            {} as any, xmlBuilder as any, {} as any, {} as any, {} as any,
        );
        await service['gerarEvento']({
            chCTe: '52261012ABC34501DE35570010000000011123456787',
            cOrgao: 52,
            CNPJ: '11222333000181',
            infCorrecao: [{ grupoAlterado: 'compl', campoAlterado: 'xObs', valorAlterado: 'Observação corrigida.' }],
        }, '110110');
        const xml = xmlBuilder.gerarXml.mock.calls[1][0];
        expect(xml.infEvento.tpEvento).toBe('110110');
        expect(xml.infEvento.detEvento.evCCeCTe.infCorrecao).toHaveLength(1);
        expect(xml.infEvento.detEvento.evCCeCTe.xCondUso).toContain('Art. 58-B');
    });
});



    it.each([['135', true], ['134', true], ['136', true], ['580', false]])('interpreta cStat %s do retorno SOAP', async (cStat, success) => {
        const xmlBuilder = {
            gerarXml: jest.fn(() => '<eventoCTe/>'),
            assinarXML: jest.fn((xml: string) => xml + '<Signature/>'),
        };
        const retorno = '<retEventoCTe xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><infEvento><tpAmb>2</tpAmb><verAplic>simulador-1</verAplic><cOrgao>52</cOrgao><cStat>' + cStat + '</cStat><xMotivo>Retorno simulado.</xMotivo><chCTe>52261012ABC34501DE35570010000000011123456787</chCTe><tpEvento>110111</tpEvento><nSeqEvento>001</nSeqEvento><dhRegEvento>2026-10-09T18:00:00-03:00</dhRegEvento><nProt>152260000000001</nProt></infEvento></retEventoCTe>';
        const service = new CTEEventoCancCCeService(
            { getConfig: () => ({ dfe: { UF: 'GO' }, nfe: { ambiente: 2 } }) } as any,
            { salvaConsulta: jest.fn(), salvaRetorno: jest.fn() } as any,
            xmlBuilder as any,
            { post: jest.fn().mockResolvedValue({ data: retorno }) } as any,
            {} as any,
            { gerarConsulta: jest.fn().mockResolvedValue({ xmlFormated: '<soap/>', agent: {}, webServiceUrl: 'https://simulador.invalid', action: 'urn:CTeRecepcaoEvento' }) } as any,
        );
        const resultado = await service.cancelar({
            chCTe: '52261012ABC34501DE35570010000000011123456787',
            cOrgao: 52,
            CNPJ: '11222333000181',
            nProt: '152260000000001',
            xJust: 'Justificativa simulada com tamanho válido.',
        });
        expect(resultado.success).toBe(success);
        expect(resultado.eventos[0]).toMatchObject({ cStat, xMotivo: 'Retorno simulado.', nProt: '152260000000001' });
    });

    it('retorna erro nomeado quando a resposta não contém cStat', async () => {
        const service = new CTEEventoCancCCeService(
            { getConfig: () => ({ dfe: { UF: 'GO' }, nfe: { ambiente: 2 } }) } as any,
            { salvaConsulta: jest.fn(), salvaRetorno: jest.fn() } as any,
            { gerarXml: jest.fn(() => '<eventoCTe/>'), assinarXML: jest.fn((xml: string) => xml) } as any,
            { post: jest.fn().mockResolvedValue({ data: '<retEventoCTe><infEvento><xMotivo>sem status</xMotivo></infEvento></retEventoCTe>' }) } as any,
            {} as any,
            { gerarConsulta: jest.fn().mockResolvedValue({ xmlFormated: '<soap/>', agent: {}, webServiceUrl: 'https://simulador.invalid', action: 'urn:CTeRecepcaoEvento' }) } as any,
        );
        await expect(service.cancelar({
            chCTe: '52261012ABC34501DE35570010000000011123456787',
            cOrgao: 52,
            CNPJ: '11222333000181',
            nProt: '152260000000001',
            xJust: 'Justificativa simulada com tamanho válido.',
        })).rejects.toThrow('CTE_EVENTO_RETORNO_SEM_CSTAT');
    });
