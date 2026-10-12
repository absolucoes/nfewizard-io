import { CTeCancelamento, CTeCartaCorrecao, CTeEventoCancCCeResultado } from '@nfewizard/types/cte';
import { CTEEventoCancCCeService } from '../../services/CTERecepcaoEvento/CTEEventoCancCCeService.js';

export class CTEEventoCancCCe {
    constructor(private readonly service: CTEEventoCancCCeService) {}
    cancelar(evento: CTeCancelamento): Promise<CTeEventoCancCCeResultado> {
        return this.service.cancelar(evento);
    }
    cartaCorrecao(evento: CTeCartaCorrecao): Promise<CTeEventoCancCCeResultado> {
        return this.service.cartaCorrecao(evento);
    }
}

