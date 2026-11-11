/*
 * This file is part of NFeWizard-io.
 *
 * NFeWizard-io is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * NFeWizard-io is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with NFeWizard-io. If not, see <https://www.gnu.org/licenses/>.
 */
const NFSeAutorizacaoService = require('../NFSeAutorizacaoService').default;
import { NFSe } from '@nfewizard/types/nfse';

const buildRequest = (): NFSe => ({
  DPS: {
    infDps: {
      tpAmb: 2,
      dhEmi: '2026-02-25T08:12:28-03:00',
      verAplic: '1.0.0',
      serie: '1',
      nDPS: '3407',
      dCompet: '2026-02-25',
      tpEmit: 1,
      cLocEmi: '3554102',
      prest: {
        CNPJ: '23903417000160',
        regTrib: {
          opSimpNac: 1,
          regEspTrib: 0,
        },
      },
      toma: {
        CPF: '46544154830',
        xNome: 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
        end: {
          endNac: {
            cMun: '3554102',
            CEP: '12040859',
          },
          xLgr: 'Rua Capitão Bernardo Sanches Pimenta',
          nro: '162',
          xBairro: 'Esplada Independência',
        },
      },
      serv: {
        locPrest: {
          cLocPrestacao: '3554102',
        },
        cServ: {
          cTribNac: '110101',
          xDescServ: 'SERVICOS DE DESENVOLVIMENTO DE PROGRAMAS DE COMPUTADOR SOB ENCOMENDA',
          cNBS: '106043000',
        },
      },
      valores: {
        vServPrest: {
          vServ: 100,
        },
        trib: {
          tribMun: {
            tribISSQN: 1,
            tpRetISSQN: 1,
          },
          totTrib: {
            vTotTrib: {
              vTotTribFed: 10,
              vTotTribEst: 5,
              vTotTribMun: 4,
            },
          },
        },
      },
    },
  },
});

const buildEnvironment = (leiaute?: string) => ({
  getConfig: () => ({
    dfe: {
      armazenarXMLConsulta: true,
      pathXMLConsulta: 'tmp/NFSe/RequestLogs',
      armazenarXMLRetorno: true,
      pathXMLRetorno: 'tmp/NFSe/Retorno',
      armazenarRetornoEmJSON: true,
      pathRetornoEmJSON: 'tmp/NFSe/RetornoJSON',
      armazenarXMLAutorizacao: false,
      pathXMLAutorizacao: 'tmp/NFSe/Autorizacao',
      incluirTimestampNoNomeDosArquivos: false,
    },
    nfse: {
      ambiente: 2,
      ...(leiaute ? { leiaute } : {}),
    },
  }),
  getHttpAgent: () => ({})
});

const buildService = (axiosPost: jest.Mock, leiaute?: string) => {
  const environment = buildEnvironment(leiaute) as any;
  const utility = {
    getWebServiceUrlNFSe: jest.fn().mockReturnValue('https://nfse.test/webservice'),
    salvaJSON: jest.fn(),
    salvaXML: jest.fn(),
  } as any;
  const xmlBuilder = {
    gerarXml: jest.fn().mockImplementation((xmlObject: any) => `<?xml version="1.0" encoding="UTF-8"?><DPS><infDPS Id="${xmlObject.infDPS.$.Id}"></infDPS></DPS>`),
    assinarXML: jest.fn().mockImplementation((xml: string) => xml),
  } as any;
  const saveFiles = {
    salvaArquivos: jest.fn(),
  } as any;
  const gerarConsulta = {
    gerarConsulta: jest.fn(),
  } as any;
  const axios = {
    post: axiosPost,
  } as any;
  let xmlObject: any;

  const service = new NFSeAutorizacaoService(environment, utility, xmlBuilder, axios, saveFiles, gerarConsulta);

  xmlBuilder.gerarXml.mockImplementation((currentXmlObject: any) => {
    xmlObject = currentXmlObject;
    return `<?xml version="1.0" encoding="UTF-8"?><DPS><infDPS Id="${currentXmlObject.infDPS.$.Id}"></infDPS></DPS>`;
  });

  return {
    service,
    utility,
    saveFiles,
    xmlBuilder,
    getXmlObject: () => xmlObject,
  };
};

describe('NFSeAutorizacaoService', () => {
  it('saves the signed DPS XML and the sent JSON payload', async () => {
    const axiosPost = jest.fn().mockResolvedValue({
      data: {
        chaveAcesso: 'CHAVE-TESTE',
      },
    });

    const { service, utility, saveFiles } = buildService(axiosPost);

    const response = await service.Exec(buildRequest());

    expect(response.success).toBe(true);
    expect(saveFiles.salvaArquivos).toHaveBeenCalledTimes(1);
    expect(utility.salvaXML).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'NFSe_Autorizacao-consulta',
      data: expect.stringContaining('<DPS'),
    }));
    expect(utility.salvaJSON).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'NFSe_Autorizacao-consulta-json',
      data: expect.objectContaining({
        dpsXmlGZipB64: expect.any(String),
      }),
    }));
  });

  it('stores an error marker when the transport fails without a response body', async () => {
    const axiosPost = jest.fn().mockRejectedValue(new Error('unable to get local issuer certificate'));

    const { service, utility } = buildService(axiosPost);

    await expect(service.Exec(buildRequest())).rejects.toThrow('unable to get local issuer certificate');

    const returnCall = utility.salvaJSON.mock.calls.find(([arg]: any[]) => arg.fileName === 'NFSe_Autorizacao-retorno');
    expect(returnCall?.[0].data).toEqual(expect.objectContaining({
      sucesso: false,
      metodo: 'NFSe_Autorizacao',
      mensagem: 'unable to get local issuer certificate',
    }));

    const consultaJsonCall = utility.salvaJSON.mock.calls.find(([arg]: any[]) => arg.fileName === 'NFSe_Autorizacao-consulta-json');
    expect(consultaJsonCall?.[0].data).toEqual(expect.objectContaining({
      dpsXmlGZipB64: expect.any(String),
    }));
  });

  it('normalizes DPS dates and preserves schema order for nested groups', async () => {
    const axiosPost = jest.fn().mockResolvedValue({
      data: {
        chaveAcesso: 'CHAVE-TESTE',
      },
    });

    const { service, getXmlObject } = buildService(axiosPost);
    const baseRequest = buildRequest();
    const baseInfDps = baseRequest.DPS as any;

    await service.Exec({
      DPS: {
        infDps: {
          ...baseInfDps.infDps,
          dhEmi: '2026-02-25T11:12:28.000Z',
          dCompet: '20260225',
          prest: {
            ...baseInfDps.infDps.prest,
            end: {
              endNac: {
                CEP: '12040859',
                cMun: '3554102',
              },
              xLgr: 'Rua Capitão Bernardo Sanches Pimenta',
              nro: '162',
              xBairro: 'Esplada Independência',
            },
          },
          serv: {
            locPrest: {
              cLocPrestacao: '3554102',
            },
            cServ: {
              cNBS: '106043000',
              cIntContrib: 'INT-01',
              xDescServ: 'SERVICOS DE DESENVOLVIMENTO DE PROGRAMAS DE COMPUTADOR SOB ENCOMENDA',
              cTribMun: '1234',
              cTribNac: '110101',
            },
          },
        },
      },
    });

    const xmlObject = getXmlObject();

    expect(xmlObject.infDPS.dhEmi).toBe('2026-02-25T08:12:28-03:00');
    expect(xmlObject.infDPS.dCompet).toBe('2026-02-25');
    expect(Object.keys(xmlObject.infDPS)).toEqual([
      'tpAmb',
      'dhEmi',
      'verAplic',
      'serie',
      'nDPS',
      'dCompet',
      'tpEmit',
      'cLocEmi',
      'prest',
      'toma',
      'serv',
      'valores',
      '$',
    ]);
    expect(Object.keys(xmlObject.infDPS.prest.end.endNac)).toEqual(['cMun', 'CEP']);
    expect(Object.keys(xmlObject.infDPS.serv.cServ)).toEqual([
      'cTribNac',
      'cTribMun',
      'xDescServ',
      'cNBS',
      'cIntContrib',
    ]);
  });

  it('deriva o CST e o CSTReg a partir do cClassTrib no bloco IBSCBS (RN 627), nunca informado a parte', async () => {
    const axiosPost = jest.fn().mockResolvedValue({
      data: {
        chaveAcesso: 'CHAVE-TESTE',
      },
    });

    const { service, getXmlObject } = buildService(axiosPost);
    const baseRequest = buildRequest();
    const baseInfDps = baseRequest.DPS as any;

    await service.Exec({
      DPS: {
        infDps: {
          ...baseInfDps.infDps,
          IBSCBS: {
            finNFSe: 0,
            cIndOp: '000001',
            indDest: 0,
            valores: {
              trib: {
                gIBSCBS: {
                  cClassTrib: '000001',
                  gTribRegular: {
                    cClassTribReg: '200002',
                  },
                },
              },
            },
          },
        },
      },
    });

    const xmlObject = getXmlObject();
    const gIBSCBS = xmlObject.infDPS.IBSCBS.valores.trib.gIBSCBS;

    expect(Object.keys(xmlObject.infDPS.IBSCBS)).toEqual(['finNFSe', 'cIndOp', 'indDest', 'valores']);
    expect(Object.keys(gIBSCBS)).toEqual(['CST', 'cClassTrib', 'gTribRegular']);
    expect(gIBSCBS.CST).toBe('000');
    expect(gIBSCBS.cClassTrib).toBe('000001');
    expect(Object.keys(gIBSCBS.gTribRegular)).toEqual(['CSTReg', 'cClassTribReg']);
    expect(gIBSCBS.gTribRegular.CSTReg).toBe('200');
    expect(gIBSCBS.gTribRegular.cClassTribReg).toBe('200002');
  });

  it('normaliza gReeRepRes do IBSCBS e rejeita documento sem identificacao', async () => {
    const axiosPost = jest.fn().mockResolvedValue({
      data: {
        chaveAcesso: 'CHAVE-TESTE',
      },
    });

    const { service, getXmlObject } = buildService(axiosPost);
    const baseRequest = buildRequest();
    const baseInfDps = baseRequest.DPS as any;

    const ibscbsBase = {
      finNFSe: 0,
      cIndOp: '000001',
      indDest: 0,
      valores: {
        trib: {
          gIBSCBS: {
            cClassTrib: '000001',
          },
        },
      },
    };

    await service.Exec({
      DPS: {
        infDps: {
          ...baseInfDps.infDps,
          IBSCBS: {
            ...ibscbsBase,
            valores: {
              ...ibscbsBase.valores,
              gReeRepRes: {
                documentos: [
                  {
                    docOutro: { nDoc: '123', xDoc: 'Nota de terceiro' },
                    dtEmiDoc: '2026-02-20',
                    dtCompDoc: '2026-02-20',
                    tpReeRepRes: '01',
                    vlrReeRepRes: 50,
                  },
                ],
              },
            },
          },
        },
      },
    });

    const xmlObject = getXmlObject();
    const documento = xmlObject.infDPS.IBSCBS.valores.gReeRepRes.documentos[0];

    expect(Object.keys(documento)).toEqual(['docOutro', 'dtEmiDoc', 'dtCompDoc', 'tpReeRepRes', 'vlrReeRepRes']);

    const { service: serviceInvalido } = buildService(axiosPost);

    await expect(
      serviceInvalido.Exec({
        DPS: {
          infDps: {
            ...baseInfDps.infDps,
            IBSCBS: {
              ...ibscbsBase,
              valores: {
                ...ibscbsBase.valores,
                gReeRepRes: {
                  documentos: [
                    {
                      dtEmiDoc: '2026-02-20',
                      dtCompDoc: '2026-02-20',
                      tpReeRepRes: '01',
                      vlrReeRepRes: 50,
                    },
                  ],
                },
              },
            },
          },
        },
      })
    ).rejects.toThrow('IBSCBS.valores.gReeRepRes: cada documento precisa informar dFeNacional, docFiscalOutro ou docOutro.');
  });
});

describe('NFSeAutorizacaoService - leiaute da NT 009 (nt009-r1)', () => {
  const ok = () => jest.fn().mockResolvedValue({ data: { chaveAcesso: 'CHAVE-TESTE' } });

  const ibscbsDaNt009 = (extra: any = {}) => ({
    indFinal: 0,
    cIndOp: '020101',
    indDest: 0,
    valores: {
      trib: {
        cClassTrib: '000001',
        ...extra,
      },
    },
  });

  const dpsDaNt009 = (ibscbs: any = ibscbsDaNt009(), finNFSe: any = 0) => {
    const base = (buildRequest().DPS as any).infDps;
    return { DPS: { infDps: { ...base, finNFSe, IBSCBS: ibscbs } } } as any;
  };

  it('sem nfse.leiaute o padrao e o 1.01: IBSCBS com finNFSe dentro, trib.gIBSCBS e xDescServ depois de cTribMun', async () => {
    const { service, getXmlObject } = buildService(ok());
    const base = (buildRequest().DPS as any).infDps;

    await service.Exec({
      DPS: {
        infDps: {
          ...base,
          IBSCBS: { finNFSe: 0, cIndOp: '020101', indDest: 0, valores: { trib: { gIBSCBS: { cClassTrib: '000001' } } } },
        },
      },
    } as any);

    const infDPS = getXmlObject().infDPS;

    expect(infDPS.finNFSe).toBeUndefined();
    expect(Object.keys(infDPS.IBSCBS)).toEqual(['finNFSe', 'cIndOp', 'indDest', 'valores']);
    expect(Object.keys(infDPS.serv.cServ)).toEqual(['cTribNac', 'xDescServ', 'cNBS']);
  });

  it('monta finNFSe em infDPS (depois de tpEmit, antes de cLocEmi), xDescServ por ultimo e CST derivado de cClassTrib', async () => {
    const { service, getXmlObject } = buildService(ok(), 'nt009-r1');

    await service.Exec(dpsDaNt009());

    const infDPS = getXmlObject().infDPS;

    expect(Object.keys(infDPS)).toEqual([
      'tpAmb', 'dhEmi', 'verAplic', 'serie', 'nDPS', 'dCompet', 'tpEmit', 'finNFSe',
      'cLocEmi', 'prest', 'toma', 'serv', 'valores', 'IBSCBS', '$',
    ]);
    expect(infDPS.finNFSe).toBe(0);
    expect(Object.keys(infDPS.serv.cServ)).toEqual(['cTribNac', 'cNBS', 'xDescServ']);
    expect(Object.keys(infDPS.IBSCBS)).toEqual(['indFinal', 'cIndOp', 'indDest', 'valores']);
    expect(infDPS.IBSCBS.finNFSe).toBeUndefined();
    expect(infDPS.IBSCBS.valores.trib).toEqual({ CST: '000', cClassTrib: '000001' });
  });

  it('cIndOp e opcional e gIBSCBS so existe com cCredPres, gTribRegular ou gDif, nessa ordem', async () => {
    const { service, getXmlObject } = buildService(ok(), 'nt009-r1');
    const semCIndOp = ibscbsDaNt009({
      gIBSCBS: {
        gDif: { pDifUF: 10, pDifMun: 5, pDifCBS: 5 },
        gTribRegular: { cClassTribReg: '200002' },
        cCredPres: '01',
      },
    });
    delete (semCIndOp as any).cIndOp;

    await service.Exec(dpsDaNt009(semCIndOp, 1));

    const ibscbs = getXmlObject().infDPS.IBSCBS;

    expect(getXmlObject().infDPS.finNFSe).toBe(1);
    expect(Object.keys(ibscbs)).toEqual(['indFinal', 'indDest', 'valores']);
    expect(Object.keys(ibscbs.valores.trib)).toEqual(['CST', 'cClassTrib', 'gIBSCBS']);
    expect(Object.keys(ibscbs.valores.trib.gIBSCBS)).toEqual(['cCredPres', 'gTribRegular', 'gDif']);
    expect(ibscbs.valores.trib.gIBSCBS.gTribRegular).toEqual({ CSTReg: '200', cClassTribReg: '200002' });
  });

  it('o DPS no formato 1.01 e recusado com a lib configurada para a NT 009', async () => {
    const { service } = buildService(ok(), 'nt009-r1');
    const base = (buildRequest().DPS as any).infDps;

    await expect(service.Exec({
      DPS: {
        infDps: {
          ...base,
          IBSCBS: { finNFSe: 0, cIndOp: '020101', indDest: 0, valores: { trib: { gIBSCBS: { cClassTrib: '000001' } } } },
        },
      },
    } as any)).rejects.toThrow('infDps.finNFSe é obrigatório no leiaute NT 009');

    await expect(service.Exec(dpsDaNt009({ finNFSe: 0, ...ibscbsDaNt009() }))).rejects.toThrow('IBSCBS.finNFSe é do leiaute 1.01');
    await expect(service.Exec(dpsDaNt009(ibscbsDaNt009({ gIBSCBS: { cClassTrib: '000001' } })))).rejects.toThrow('formato do leiaute 1.01');
    await expect(service.Exec(dpsDaNt009({ ...ibscbsDaNt009(), valores: { gReeRepRes: { documentos: [] }, trib: { cClassTrib: '000001' } } })))
      .rejects.toThrow('gReeRepRes não existe no leiaute NT 009');
  });

  it('o DPS no formato da NT 009 e recusado com a lib no leiaute 1.01', async () => {
    const { service } = buildService(ok());
    const { service: explicito } = buildService(ok(), '1.01');

    await expect(service.Exec(dpsDaNt009())).rejects.toThrow('infDps.finNFSe é do leiaute NT 009');
    await expect(explicito.Exec(dpsDaNt009())).rejects.toThrow('infDps.finNFSe é do leiaute NT 009');

    const base = (buildRequest().DPS as any).infDps;
    await expect(service.Exec({ DPS: { infDps: { ...base, IBSCBS: ibscbsDaNt009() } } } as any))
      .rejects.toThrow('IBSCBS no formato da NT 009');
  });

  it('leiaute desconhecido e erro, nao cai no 1.01 em silencio', async () => {
    const { service } = buildService(ok(), 'nt009-r9');

    await expect(service.Exec(buildRequest())).rejects.toThrow('nfse.leiaute desconhecido: "nt009-r9"');
  });
});