# @nfewizard/mdfe

Biblioteca GPL-3.0 para operações do MDF-e 3.00b usando os serviços da SVRS e os recursos de certificado, XML e HTTP de `@nfewizard/shared`.

## Inicialização

Use `MDFeWizard.MDFe_LoadEnvironment({ config })` com o mesmo formato de configuração usado pelos demais pacotes nfewizard. O ambiente carrega o certificado A1 e configura o cliente HTTP mútuo.

## Operações implementadas

- `MDFe_Autorizacao(payload)`: calcula a chave modelo 58 e o DV, monta, assina, adiciona QR Code, valida pelo XSD, compacta em GZip/Base64, transmite de forma síncrona e interpreta o protocolo. Em cStat 100, devolve também `mdfeProc`.
- `MDFe_ConsultaStatusServico(tpAmb)`.
- `MDFe_Consulta(chave, tpAmb)`.
- `MDFe_ConsNaoEncerrados(cnpj, tpAmb)`.
- `MDFe_RecepcaoEvento(dados)`: cancelamento (110111), encerramento (110112) e inclusão de condutor (110114), com validação XSD específica e leitura do retorno do evento.

O roteamento seleciona as URLs oficiais da SVRS por ambiente a partir de `src/config/MDFeServicosUrl.json`. O QR Code usa a URL oficial única da SVRS.

## Schemas e validação

Embarca os schemas oficiais do MDF-e 3.00b, pacote PL_MDFe_300b_NT012025_1.04, publicado no Portal SVRS em 25/04/2026. A validação usa libxmljs2 e xsd-assembler; não requer Java em runtime. Regras de negócio continuam sujeitas ao MOC e às Notas Técnicas vigentes.

## Testes

`pnpm --filter @nfewizard/mdfe test` executa testes do DV, QR Code, XSD, eventos, SOAP, GZip/Base64 e simulação interna com certificado/assinatura falsos e respostas controladas. A simulação não prova conexão nem autorização da SEFAZ. O DAMDFE pode ser gerado com MDFE_GerarDamdfe usando mdfeProc autorizado e é exportado por @nfewizard/danfe; exige cStat 100 e imprime a marca obrigatória de homologação.
