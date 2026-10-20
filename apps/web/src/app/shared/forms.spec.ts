import { LabelPipe, options } from './forms';

describe('LabelPipe', () => {
  const pipe = new LabelPipe();

  it('traduz valores de enumeração', () => {
    expect(pipe.transform('editor', 'memberRole')).toBe('Edita PEI');
    expect(pipe.transform('comunicacao', 'developmentArea')).toBe('Comunicação e linguagem');
  });

  it('mostra travessão para vazio e o próprio valor quando desconhecido', () => {
    expect(pipe.transform(null, 'memberRole')).toBe('—');
    expect(pipe.transform('x', 'memberRole')).toBe('x');
  });
});

describe('options', () => {
  it('lista pares [valor, rótulo] na ordem declarada', () => {
    expect(options('memberRole')).toEqual([
      ['admin', 'Administrador'],
      ['editor', 'Edita PEI'],
      ['viewer', 'Só leitura'],
    ]);
  });
});
