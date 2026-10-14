# CHANGELOG-VANIR

O que `vanir/main` tem a mais (ou diferente) do upstream `nfewizard-org/nfewizard-io`, e o teste que prova cada correção.
Cada linha: pacote, motivo, teste que a prova (e o que acontece sem ela), PR no upstream (se houver).
Regra: correção sem teste que falhe sem ela não entra aqui.

## Integração (sem correção)

- **cte**: o CT-e do Vanir (QR Code, eventos, validação de XSD) foi integrado sobre o motor de CT-e do upstream. Onde os dois divergiam, vale o
  motor do upstream e as peças próprias do fork foram reaplicadas em cima. A API de evento plana (`CTEEventoCancCCeService`) do fork foi mantida.
- **mdfe**: o pacote do fork entra como está no `vanir/mdfe`, com o DAMDFE em `danfe`.
- **danfe**: DACTE e DAMDFE vêm do fork; DANFE/NFC-e seguem do upstream.

## Correções

| Pacote | Correção e motivo | Teste que a prova | Sem a correção | Upstream |
| --- | --- | --- | --- | --- |
| shared | XSD da NF-e aceita `tpNFCredito` 04 a 06 e CNPJ alfanumérico na chave e nos tipos; o XSD publicado recusava ambos | `packages/shared/src/utils/__tests__/SchemaNFeAlfanumerico.test.ts` | 3 de 6 testes falham | - |
| danfe | `logo` (Buffer) opcional no DANFE e no DACTE, com o texto do emitente deslocado | `packages/danfe/src/generators/identidadeVisual.test.ts` (logo, NF-e e CT-e) | os testes de logo falham (5 de 7 do arquivo falham no conjunto) | - |
| danfe | `faixaAmbiente` opcional troca o texto de homologação; sem ela o texto original permanece | idem (faixa, NF-e e CT-e) | idem | - |
| danfe | DANFE de item autorizado sem grupo de ICMS (serviço) caía com `TypeError` | idem (`gera o DANFE de um item autorizado sem grupo de ICMS`) | TypeError | - |
| danfe | DACTE com a mesma identidade visual do DANFE (logo e faixa), como no brief 08 do Vanir | idem (bloco `DACTE (CT-e)`) | idem | - |
| danfe | DAMDFE lê o RNTRC de `rodo/infANTT/RNTRC`, onde o XSD 3.00 o põe, no cabeçalho e no campo do veículo de tração (`emit.RNTRC` e `veicTracao.RNTRC` ficam só como recurso, depois do `infANTT`); antes o campo saía vazio ("RNTRC:") | `packages/danfe/src/generators/MDFEGerarDamdfe.test.ts` (`o RNTRC vem de infANTT`, `infANTT tem prioridade`) | 2 testes falham | - |
| danfe | DAMDFE com RENAVAM e tara do veículo de tração, reboques (placa, UF, RENAVAM, tara, capacidade), vale-pedágio (fornecedora, responsável, comprovante, valor) e lacres (do modal e do MDF-e), como no Anexo II do MOC; campos de reboque, vale-pedágio e lacres só aparecem quando informados e a lista de documentos recalcula quantos cabem por folha | idem (`traz RENAVAM e tara`, `reboques`, `vale-pedágio`, `lacres`, `sem reboque...`, `nenhum documento se perde`; os dois últimos são guarda e passam também sem a correção) | 4 testes falham | - |
| danfe | DAMDFE com os documentos agrupados por município de descarga, como no Anexo II do MOC: cada município ganha um título (nome, código IBGE e quantos documentos), com as chaves de CT-e, NF-e e MDF-e dele embaixo; o título não fica sozinho no fim da folha, e o município que continua na folha seguinte repete o título com "(continuação)". Antes saía uma lista plana de tipo e chave, sem dizer a que município cada documento pertence | `packages/danfe/src/generators/MDFEGerarDamdfe.test.ts` (bloco `documentos agrupados por município de descarga`) | 3 testes falham (o de "sem documento" é guarda) | - |
| danfe | DAMDFE honra `logo` (Buffer, quadro à esquerda do emitente com o texto deslocado) e `faixaAmbiente` (substitui o texto padrão da marca de homologação, que só sai com `tpAmb` 2), como o DANFE e o DACTE; antes ignorava os dois | idem (bloco `logo e faixa de ambiente do Vanir`) | 3 testes falham (o de produção e o de nulos são guarda) | - |
| cte | `dhEvento` gerado pela lib em horário de Brasília, `AAAA-MM-DDThh:mm:ss-03:00`, sem milissegundos e sem `Z`, na origem, nos dois motores de evento; independe do fuso do processo | `packages/cte/src/services/CTERecepcaoEvento/__tests__/DhEvento.test.ts`; `.mjs` igual a `.cjs` em `pnpm --filter @nfewizard/cte test:dist` | 4 de 5 testes falham | - |
| cte | `ide/toma4` na ordem do XSD (`toma` antes do documento); o tomador "outros" era recusado com `Element CNPJ is not expected. Expected is toma` | `packages/cte/src/services/CTEAutorizacao/__tests__/CTEAutorizacaoXsd.test.ts` | o teste de XML de referência falha com a rejeição acima | - |
| cte | CT-e com expedidor e recebedor passa no `cte_v4.00.xsd` e bate com um XML de referência (golden) | idem, `ouro/cte-toma4-exped-receb.xml` | idem | - |
| cte | `validarXmlCte` acha os XSD pelo caminho do módulo, não pelo `cwd`; no pacote instalado o `cwd` é o do cliente | `pnpm --filter @nfewizard/cte test:dist` (roda `dist/index.cjs` e `dist/index.mjs` de um diretório fora do pacote) | os 5 XSD deixam de ser encontrados nos dois formatos | - |
| cte | `cCT` informado no payload entra na chave de acesso e é devolvido ao objeto | `CTEAutorizacaoXsd.test.ts` (bloco `cCT`) | **já era comportamento do upstream**: o teste fica como guarda; não falha ao retirar a correção porque ela não é mais necessária | - |
| mdfe | Envelope SOAP por operação (MDFeRecepcaoSinc, MDFeRecepcaoEvento, MDFeConsulta, MDFeStatusServico, MDFeConsNaoEnc): `mdfeCabecMsg` (cUF, versaoDados) no Header, sem elemento da operação em volta do `mdfeDadosMsg`, `action` com o método, XML como nó e não escapado | `packages/mdfe/src/util/MDFeSoap.test.ts` (bloco do envelope) e `MDFeTransmissao.test.ts` | 12 testes falham | - |
| mdfe | Retorno da consulta de situação lê `retConsSitMDFe` (antes valia o `cStat` do evento que ela carrega); lista de não encerrados (`retConsMDFeNaoEnc`) devolve as chaves | `MDFeSoap.test.ts` (bloco `retornos do MDF-e`) | 3 testes falham | - |
| mdfe | `ide` sai na sequência do XSD, qualquer que seja a ordem do payload | `MDFeSoap.test.ts` (`ordem de ide`) | 1 teste falha | - |
| mdfe | XSD achados pelo caminho do módulo, não pelo `cwd` | `MDFeSoap.test.ts` (`caminho dos XSD`) e `pnpm --filter @nfewizard/mdfe test:dist` | 2 testes falham | - |
| mdfe | Testes só com dados fictícios no formato dos exemplos públicos do leiaute e do WSDL; nenhum XML de emissão real | (regra para os testes do pacote) | - | - |
| nfce | O CSC saía no header HTTP da autorização (`'CSC': tokenCSC`) e, com o header, no `logger.http`; nenhum webservice o pede, e ele só entra no hash do QR Code. Agora o header leva só `Content-Type` e `SOAPAction`. O pacote passa a ser publicado como `@absolucoes/nfewizard-nfce` (sétimo pacote) e sai o `NFCEAutorizacaoService.ts.maure.tmp` | `packages/nfce/src/services/NFCEAutorizacao/__tests__/CscForaDoHttp.test.ts` | 2 de 2 testes falham | - |
| nfce | QR Code v3 da NFC-e: `nfe.versaoQRCode: 3` gera o QR sem CSC, sem `idCSC` e sem hash; online é `chave\|3\|tpAmb`, off-line (tpEmis 4 ou 9) é `chave\|3\|tpAmb\|dia\|vNF\|tp_idDest\|idDest` assinado RSA-SHA1 em base64 com a chave do certificado. O dia sai do texto do `dhEmi` (não do fuso do processo) e `tpEmis` em texto ("9", como vem de um XML lido) também vale como contingência. Sem `versaoQRCode` (ou 2) o XML sai idêntico ao de antes | `packages/nfce/src/services/NFCEAutorizacao/__tests__/QRCode.test.ts` (golden v2 online e off-line, v3 online e off-line, assinatura conferida com a chave pública) | 16 de 19 testes falham (os 3 de v2 são guarda e passam) | - |
| danfe | DANFCE conforme o Manual v6.0: coluna única de 80 mm (ou 56 mm por `pageWidth`), faixa de homologação com `tpAmb` 2 (ou `faixaAmbiente`), "EMITIDA EM CONTINGÊNCIA" e "Pendente de autorização" quando não há protocolo real (o `protNFe` de mentira do serviço de contingência, `nProt` CONTINGENCIA e `cStat` 000, conta como sem protocolo), via do estabelecimento com linha de assinatura, "NFC-e CANCELADA", logo opcional, chave em blocos de 4 numa linha, descrição do item completa com quebra, QR de no mínimo 25 mm e letra de no mínimo 5 pt. Antes imprimia "Protocolo de autorização: 123" com a data de agora em nota sem protocolo, "NaN" quando faltava `vTotTrib`, lia o troco do grupo errado e mostrava a hora no fuso do processo | `packages/danfe/src/generators/NFCEGerarDanfe.test.ts` (16 testes; o leitor de PDF está em `packages/danfe/test-support/pdfTexto.ts`) | 16 de 16 testes falham | - |
| nfce | Evento 110112 (cancelamento por substituição) em `NFCE_CancelamentoPorSubstituicao`: `detEvento` na ordem do leiaute (`descEvento`, `cOrgaoAutor`, `tpAutor`, `verAplic`, `nProt`, `xJust`, `chNFeRef`), `descEvento` "Cancelamento por substituicao" sem acento e `tpAutor` 1 fixados pela lib, `cOrgaoAutor` = `cOrgao` quando não vem, recusa de `nProt` vazio, `xJust` com menos de 15 caracteres, `chNFeRef` que não seja chave e `verAplic` vazio; evento nacional; o 110111 não muda. Corrige também o tipo `'“110112'` (aspas curvas) de `NFERecepcaoEvento` | `packages/nfce/src/services/NFCERecepcaoEvento/__tests__/CancelamentoSubstituicao.test.ts` (golden `ouro/evento-110112.xml` e XSD `envEventoCancSubst`, com controle positivo, e as quatro recusas) | o recurso não existia: 12 de 12 falham; só com o XSD antigo (abaixo), 2 falham | - |
| shared | XSD do 110112 (`e110112_v1.00.xsd` e `leiauteEventoCancSubst_v1.00.xsd`) incluía `tiposBasico_v1.03`, sem `TCOrgaoIBGE`, e recusava qualquer evento; passa a incluir `tiposBasico_v4.00`. Novo método de validação `NFEEventoCancSubst` (o `RecepcaoEvento` aponta para o `envEvento` genérico, que não conhece o `detEvento` do 110112). `procInutNFe_v4.00.xsd` com a raiz `procInutNFe` | `CancelamentoSubstituicao.test.ts` (`passa no XSD do cancelamento por substituição` e `o XSD recusa o que a lib não manda`) | 2 testes falham (verificado devolvendo o include antigo); a raiz do `procInutNFe` não tem teste próprio | - |
| nfce | Status do serviço do modelo 65 (`NFCE_ConsultaStatusServico`): consulta o webservice da NFC-e da UF (`NFCe_<UF>_<ambiente>`). O do pacote principal vai ao endereço do modelo 55, que difere em SP, MG, MS, MT, PR, RS e AM, entre outras | `packages/nfce/src/services/NFCEStatusServico/__tests__/NFCEStatusServicoService.test.ts` (SP, homologação e produção, com Utility e GerarConsulta de verdade) | 2 de 3 testes falham (o do XML `consStatServ` é guarda) | - |
| io | Inutilização do modelo 65 (`NFE_Inutilizacao` com `mod` 65): a lib já atendia; entra o golden do XML, o `Id` com modelo, série e números, o XSD `inutNFe_v4.00` e a escolha do webservice pelo modelo | `packages/nfewizard-io/src/nfe/services/NFEInutilizacao/__tests__/InutilizacaoMod65.test.ts` | **já era comportamento do upstream**: o teste fica como guarda; não falha ao retirar nada | - |

Higiene sem teste próprio, que não conta como correção: o `console.table` das funções do `NFCEWizard` deixa de imprimir a chave de
acesso (a chave leva o CNPJ do emitente e identifica a venda) e o construtor do serviço de eventos da NFC-e perde um `console.log`.

## Não implementado de propósito

- **Evento 610110 (prestação de serviço em desacordo, CT-e)**: não implementado de propósito na API de evento plana do fork
  (`CTEEventoCancCCeService`: cancelamento e CC-e, a que o Vanir usa). O evento existe só no motor genérico de eventos do
  upstream (`CTEWizard`/`CTERecepcaoEventoService`), mantido como veio, sem uso do fork. O Vanir não emite 610110 até haver caso de uso e homologação.

## Pendente de conferência

- **NFC-e, contra a SEFAZ com certificado real** (nada disto foi transmitido; os testes usam par de chaves gerado na hora):
  o evento 110112 em homologação (a nota substituta tem de estar em tpEmis 9, senão cStat 920); a leitura do QR Code v3 pelo
  aplicativo da SEFAZ, em particular se a assinatura base64 do off-line precisa de URL-encoding; a impressão física do DANFCE.
- **DANFCE**: o texto exato da via do estabelecimento e a redação e a ordem das divisões I a IX seguem o que o Manual v6.0
  descreve, mas o Manual e a NT não estavam à mão na escrita; conferir contra o PDF oficial.

- Os nomes de método do `action` SOAP do MDF-e (`mdfeRecepcao`, `mdfeRecepcaoEvento`, `mdfeConsultaMDF`,
  `mdfeStatusServicoMDF`, `mdfeConsNaoEnc`) vêm do projeto sped-mdfe. O WSDL da SVRS não estava acessível na escrita
  e eles ainda precisam ser conferidos contra ele (homologação).
