import * as Y from 'yjs';

describe('Yjs CRDT convergence', () => {
  it('converges after independent updates are exchanged', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText('content');
    const textB = docB.getText('content');

    textA.insert(0, 'Hello');
    textB.insert(0, 'World');

    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    expect(textA.toString()).toBe(textB.toString());
  });

  it('reaches the source state when updates arrive out of order', () => {
    const source = new Y.Doc();
    const target = new Y.Doc();
    const sourceText = source.getText('content');
    const updates: Uint8Array[] = [];

    let stateVector = Y.encodeStateVector(source);
    sourceText.insert(0, 'one');
    updates.push(Y.encodeStateAsUpdate(source, stateVector));

    stateVector = Y.encodeStateVector(source);
    sourceText.insert(3, '-two');
    updates.push(Y.encodeStateAsUpdate(source, stateVector));

    stateVector = Y.encodeStateVector(source);
    sourceText.insert(7, '-three');
    updates.push(Y.encodeStateAsUpdate(source, stateVector));

    for (const update of [updates[2], updates[0], updates[1]]) {
      Y.applyUpdate(target, update);
    }

    expect(target.getText('content').toString()).toBe(sourceText.toString());
  });
});
