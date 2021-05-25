let currentId = 0;

function nextId() {
  currentId += 1;
  return currentId;
}

module.exports = nextId;