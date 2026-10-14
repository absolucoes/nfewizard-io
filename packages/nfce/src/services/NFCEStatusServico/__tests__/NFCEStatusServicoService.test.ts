/*
 * Status do serviço do modelo 65: a consulta tem de ir ao webservice da NFC-e da UF e não ao da NF-e.
 * SP serve de prova porque os dois endereços são diferentes (em GO coincidem). Utility e GerarConsulta são
 * os de verdade; só o axios é falso, para ler a URL e o XML enviados. Nenhum certificado.
 */
import { Utility, XmlBuilder, GerarConsulta } from '@nfewizard/shared';

const { NFCEStatusServicoService } = require('../NFCEStatusServicoService');

const RETORNO = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4"><retConsStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>2</tpAmb><verAplic>SP_NFCE_v1</verAplic><cStat>107</cStat><xMotivo>Servico em Operacao</xMotivo><cUF>35</cUF></retConsStatServ></nfeResultMsg></soap:Body></soap:Envelope>`;

function montar(ambiente: 1 | 2) {
    const chamadas: { url: string; corpo: string }[] = [];
    const config: any = {
        dfe: { ambiente, UF: 'SP', baixarXMLDistribuicao: false },
        nfe: { ambiente, versaoDF: '4.00' },
        lib: { useForSchemaValidation: 'validateSchemaJsBased' },
    };
    const environment: any = {
        config,
        getConfig: () => config,
        getHttpAgent: () => ({}),
        getCert: () => '',
        getCertKey: () => '',
    };
    const utility = new Utility(environment);
    const xmlBuilder = new XmlBuilder(environment);
    const gerarConsulta = new GerarConsulta(environment, utility, xmlBuilder);
    const axios: any = {
        post: async (url: string, corpo: string) => {
            chamadas.push({ url, corpo });
            return { data: RETORNO };
        },
    };
    const saveFiles: any = { salvaArquivos: () => undefined };
    const servico = new NFCEStatusServicoService(environment, utility, xmlBuilder, axios, saveFiles, gerarConsulta);
    return { servico, chamadas };
}

describe('status do serviço da NFC-e', () => {
    it('em homologação consulta o webservice da NFC-e de SP, não o da NF-e', async () => {
        const { servico, chamadas } = montar(2);
        const r = await servico.Exec();
        expect(chamadas).toHaveLength(1);
        expect(chamadas[0].url).toBe('https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx');
        expect(chamadas[0].url).not.toContain('homologacao.nfe.fazenda');
        expect(r.cStat).toBe('107');
    });

    it('em produção consulta o webservice da NFC-e de SP', async () => {
        const { servico, chamadas } = montar(1);
        await servico.Exec();
        expect(chamadas[0].url).toBe('https://nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx');
    });

    it('envia consStatServ com o código da UF e o ambiente', async () => {
        const { servico, chamadas } = montar(2);
        await servico.Exec();
        expect(chamadas[0].corpo).toContain('<consStatServ');
        expect(chamadas[0].corpo).toContain('<tpAmb>2</tpAmb>');
        expect(chamadas[0].corpo).toContain('<cUF>35</cUF>');
        expect(chamadas[0].corpo).toContain('<xServ>STATUS</xServ>');
    });
});
