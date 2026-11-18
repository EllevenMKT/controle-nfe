// Leitura de chave de NF-e (DANFE) e de código de boleto (linha digitável / código de barras).
(function (root) {
  const dig = s => String(s || '').replace(/\D/g, '');

  /* ---------- NF-e: chave de acesso (44 dígitos) ---------- */
  const UF = {11:'RO',12:'AC',13:'AM',14:'RR',15:'PA',16:'AP',17:'TO',21:'MA',22:'PI',23:'CE',24:'RN',25:'PB',26:'PE',27:'AL',28:'SE',29:'BA',
    31:'MG',32:'ES',33:'RJ',35:'SP',41:'PR',42:'SC',43:'RS',50:'MS',51:'MT',52:'GO',53:'DF'};
  function dvChave(c43) { let s = 0, w = 2; for (let i = c43.length - 1; i >= 0; i--) { s += +c43[i] * w; w = w === 9 ? 2 : w + 1 } const r = s % 11; return r < 2 ? 0 : 11 - r; }
  function lerChave(txt) {
    const c = dig(txt);
    if (c.length !== 44) return { ok: false, erro: c.length ? `A chave tem ${c.length} dígitos; são 44.` : '' };
    const valida = dvChave(c.slice(0, 43)) === +c[43];
    const cnpj = c.slice(6, 20), mod = c.slice(20, 22);
    return {
      ok: true, valida, chave: c,
      uf: UF[+c.slice(0, 2)] || '', ano: 2000 + +c.slice(2, 4), mes: +c.slice(4, 6),
      cnpj, cnpjFmt: cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'),
      modelo: mod === '65' ? 'NFC-e' : mod === '55' ? 'NF-e' : 'mod. ' + mod,
      serie: String(+c.slice(22, 25)), numero: String(+c.slice(25, 34))
    };
  }

  /* ---------- Boleto ---------- */
  const BANCOS = {'001':'Banco do Brasil','003':'Banco da Amazônia','004':'Banco do Nordeste','021':'Banestes','033':'Santander','036':'Bradesco BBI','037':'Banpará',
    '041':'Banrisul','047':'Banese','070':'BRB','077':'Inter','084':'Uniprime','085':'Ailos','097':'Credisis','104':'Caixa','133':'Cresol','136':'Unicred',
    '197':'Stone','208':'BTG Pactual','212':'Original','237':'Bradesco','260':'Nubank','274':'Money Plus','290':'PagBank','323':'Mercado Pago','336':'C6 Bank',
    '341':'Itaú','376':'J.P. Morgan','380':'PicPay','389':'Mercantil do Brasil','403':'Cora','422':'Safra','461':'Asaas','623':'Pan','633':'Rendimento','637':'Sofisa',
    '643':'Pine','655':'Votorantim','707':'Daycoval','739':'Cetelem','741':'Ribeirão Preto','745':'Citibank','748':'Sicredi','756':'Sicoob'};

  const mod10 = s => { let t = 0, w = 2; for (let i = s.length - 1; i >= 0; i--) { let p = +s[i] * w; t += p > 9 ? p - 9 : p; w = w === 2 ? 1 : 2 } return (10 - t % 10) % 10; };
  const mod11Banco = s => { let t = 0, w = 2; for (let i = s.length - 1; i >= 0; i--) { t += +s[i] * w; w = w === 9 ? 2 : w + 1 } const d = 11 - t % 11; return d === 0 || d === 10 || d === 11 ? 1 : d; };
  const mod11Arrec = s => { let t = 0, w = 2; for (let i = s.length - 1; i >= 0; i--) { t += +s[i] * w; w = w === 9 ? 2 : w + 1 } const r = t % 11; return r === 0 || r === 1 ? 0 : r === 10 ? 1 : 11 - r; };

  // Fator de vencimento: dias desde 07/10/1997, reiniciado em 1000 a cada 9000 dias (ex.: 22/02/2025).
  function fatorParaData(fator, hoje) {
    if (!fator) return '';
    const base = Date.UTC(1997, 9, 7), dia = 864e5;
    const h = hoje || new Date(), ref = Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
    let melhor = null;
    for (let k = 0; k < 5; k++) { const t = base + (fator + k * 9000) * dia; if (melhor === null || Math.abs(t - ref) < Math.abs(melhor - ref)) melhor = t; }
    const d = new Date(melhor); return d.toISOString().slice(0, 10);
  }

  function linhaDeBarras(b) { // código de barras bancário (44) → linha digitável (47)
    const c1 = b.slice(0, 4) + b.slice(19, 24), c2 = b.slice(24, 34), c3 = b.slice(34, 44);
    return c1 + mod10(c1) + c2 + mod10(c2) + c3 + mod10(c3) + b[4] + b.slice(5, 19);
  }
  function barrasDeLinha(l) { return l.slice(0, 4) + l[32] + l.slice(33, 47) + l.slice(4, 9) + l.slice(10, 20) + l.slice(21, 31); }
  const fmtLinha = l => `${l.slice(0,5)}.${l.slice(5,10)} ${l.slice(10,15)}.${l.slice(15,21)} ${l.slice(21,26)}.${l.slice(26,32)} ${l[32]} ${l.slice(33)}`;

  function lerBoleto(txt, hoje) {
    const c = dig(txt);
    if (!c) return { ok: false, erro: '' };
    // Arrecadação / convênio (contas de consumo, tributos): começa com 8
    if (c[0] === '8' && (c.length === 44 || c.length === 48)) {
      const b = c.length === 48 ? c.slice(0, 11) + c.slice(12, 23) + c.slice(24, 35) + c.slice(36, 47) : c;
      const ef = b[2] === '6' || b[2] === '7', dvf = ef ? mod10 : mod11Arrec;
      const valida = dvf(b.slice(0, 3) + b.slice(4)) === +b[3];
      const blocos = [0, 11, 22, 33].map(i => b.slice(i, i + 11)), linha = blocos.map(x => x + dvf(x)).join('');
      const valor = (b[2] === '6' || b[2] === '8') ? +b.slice(4, 15) / 100 : 0;
      return { ok: true, tipo: 'convenio', valida, barras: b, linha, linhaFmt: blocos.map(x => `${x}-${dvf(x)}`).join(' '), valor, venc: '', banco: '' };
    }
    let barras, linha, valida;
    if (c.length === 47) { linha = c; barras = barrasDeLinha(c);
      valida = mod10(c.slice(0, 9)) === +c[9] && mod10(c.slice(10, 20)) === +c[20] && mod10(c.slice(21, 31)) === +c[31] && mod11Banco(barras.slice(0, 4) + barras.slice(5)) === +barras[4]; }
    else if (c.length === 44) { barras = c; linha = linhaDeBarras(c); valida = mod11Banco(c.slice(0, 4) + c.slice(5)) === +c[4]; }
    else if (c.length >= 36 && c.length < 47) { // linha digitável sem os zeros finais do valor
      return { ok: false, erro: `Faltam dígitos: ${c.length} de 47.` };
    }
    else return { ok: false, erro: `Código com ${c.length} dígitos. A linha digitável tem 47 e o código de barras 44.` };
    const fator = +barras.slice(5, 9), valor = +barras.slice(9, 19) / 100, cod = barras.slice(0, 3);
    return { ok: true, tipo: 'bancario', valida, barras, linha, linhaFmt: fmtLinha(linha), banco: BANCOS[cod] ? `${BANCOS[cod]} (${cod})` : `Banco ${cod}`,
      bancoCod: cod, valor, venc: fatorParaData(fator, hoje) };
  }

  const api = { lerChave, lerBoleto, fatorParaData, linhaDeBarras, mod10, mod11Banco, dvChave };
  if (typeof module !== 'undefined') module.exports = api; else root.Codigos = api;
})(this);
