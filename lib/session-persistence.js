const SeedData = require("./seed-data");
const deepCopy = require("./deep-copy");
const nextId = require("./next-id");
const { sortByTitle } = require("./sort");

module.exports = class SessionPersistence {
  constructor(session) {
    this._todoLists = session.todoLists || deepCopy(SeedData);
    session.todoLists = this._todoLists;
  }

  listDone(list) {
    return list.todos.length > 0 && list.todos.every(item => item.done);
  }

  somethingLeftToDo(list) {
    return list.todos.some(item => !item.done);
  }

  getSortedLists() {
    let lists = deepCopy(this._todoLists);
    let notDoneLists = lists.filter(list => !this.listDone(list));
    let doneLists = lists.filter(list => this.listDone(list));
    return [].concat(sortByTitle(notDoneLists), sortByTitle(doneLists));
  }

  getListFromId(id) {
    let list = this._findList(id);
    return deepCopy(list);
  }

  getTodoFromList(todoId, list) {
    return list.todos.find(item => item.id === todoId);
  }

  toggleTodo(listId, todoId) {
    let todo = this._findTodo(listId, todoId);
    todo.done = !todo.done;
  }

  deleteTodo(listId, todoId) {
    let list = this._findList(listId);
    let index = list.todos.findIndex(item => item.id === todoId);
    list.todos.splice(index, 1);
  }

  markListDone(listId) {
    let list = this._findList(listId);
    list.todos.forEach(item => {
      item.done = true;
    });
  }

  addTodo(listId, title) {
    let list = this._findList(listId);
    list.todos.push({
      id: nextId(),
      title: title,
      done: false
    });
  }

  newList(title) {
    this._todoLists.push({
      id: nextId(),
      title: title,
      todos: []
    });
  }

  deleteList(listId) {
    let index = this._todoLists.findIndex(list => list.id === listId);
    this._todoLists.splice(index,1);
  }

  setListTitle(listId, title) {
    this._findList(listId).title = title;
  }

  validTitle(title) {
    return !this._todoLists.some(list => list.title === title);
  }

  _findList(listId) {
    return this._todoLists.find(list => list.id === listId);
  }

  _findTodo(listId, todoId) {
    let list = this._findList(listId);
    return list.todos.find(item => item.id === todoId);
  }

  uniqueConstraintValidation(_error) {
    return false;
  }
};