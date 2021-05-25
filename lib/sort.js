// return copy of array (todo lists or todos)
// sorted by title and status (done/no done)
function sortByTitle(array) {
  return array.slice()
              .sort((elementA, elementB) => {
                let titleA = elementA.title.toLowerCase();
                let titleB = elementB.title.toLowerCase();

                if (titleA > titleB) return 1;
                else if (titleA < titleB) return -1;
                else return 0;
              });
}

function sortByStatus(todos) {
  return todos.slice()
  .sort((todoA, todoB) => {
    if (todoA.done && !todoB.done) return 1;
    else if (!todoA.done && todoB.done) return -1;
    else return 0;
  });
}

module.exports = { sortByTitle, sortByStatus };