const assert = require('assert');

// Keep a pure helper for reuse in tests and components.
function computeMasterState(children) {
  const allOn = children.length > 0 && children.every(Boolean);
  const allOff = children.length > 0 && children.every(v => !v);
  return {
    masterChecked: allOn,
    masterIndeterminate: !allOn && !allOff,
  };
}

function toggleMaster(children) {
  const { masterChecked, masterIndeterminate } = computeMasterState(children);
  const target = masterChecked ? false : true; // indeterminate also flips to all on
  // If indeterminate and target is true, set all on; if indeterminate and target false, set all off
  if (masterIndeterminate && target) {
    return children.map(() => true);
  }
  if (masterIndeterminate && !target) {
    return children.map(() => false);
  }
  return children.map(() => target);
}

function toggleChild(children, idx) {
  const next = [...children];
  next[idx] = !next[idx];
  return next;
}

// Scenario 1: master selects all, child unchecks, master rechecks all
let children = [false, false, false];
let m = computeMasterState(children);
assert.deepStrictEqual(m, { masterChecked: false, masterIndeterminate: false });

children = toggleMaster(children); // click master -> all on
assert.deepStrictEqual(children, [true, true, true]);
assert.deepStrictEqual(computeMasterState(children), { masterChecked: true, masterIndeterminate: false });

children = toggleChild(children, 1); // uncheck one
assert.deepStrictEqual(children, [true, false, true]);
m = computeMasterState(children);
assert.strictEqual(m.masterChecked, false);
assert.strictEqual(m.masterIndeterminate, true);

children = toggleMaster(children); // click master in indeterminate -> all on
assert.deepStrictEqual(children, [true, true, true]);
assert.deepStrictEqual(computeMasterState(children), { masterChecked: true, masterIndeterminate: false });

// Scenario 2: all on -> master off
children = toggleMaster(children); // click master while all on -> all off
assert.deepStrictEqual(children, [false, false, false]);
assert.deepStrictEqual(computeMasterState(children), { masterChecked: false, masterIndeterminate: false });

// Scenario 3: partial -> master off then on
children = [true, false, false];
m = computeMasterState(children);
assert.strictEqual(m.masterIndeterminate, true);
children = toggleMaster(children); // should set all on
assert.deepStrictEqual(children, [true, true, true]);
children = toggleMaster(children); // now all off
assert.deepStrictEqual(children, [false, false, false]);

console.log('All report toggle tests passed');
