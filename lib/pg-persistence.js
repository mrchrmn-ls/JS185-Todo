const { dbQuery } = require("./db-query");
const bcrypt = require("bcrypt");

module.exports = class PgPersistence {
  constructor(session) {
    this.username = session.username;
  }

  async userAuthenticated(username, password) {
    const FIND_HASHED_PASSWORD = "SELECT password FROM users WHERE username = $1";
    let result = await dbQuery(FIND_HASHED_PASSWORD, username);
    if (result.rowCount === 0) return false;

    return bcrypt.compare(password, result.rows[0].password);
  }

  listDone(list) {
    return list.todos.length > 0 && list.todos.every(item => item.done);
  }

  somethingLeftToDo(list) {
    return list.todos.some(item => !item.done);
  }

  _reorderTodoLists(lists) {
    let notDone = [];
    let done = [];

    lists.forEach(list => {
      if (this.listDone(list)) done.push(list);
      else notDone.push(list);
    });

    return notDone.concat(done);
  }

  async getSortedLists() {
    const ALL_TODOLISTS = "SELECT * FROM todolists WHERE username = $1 ORDER BY lower(title) ASC";
    const FIND_TODOS = "SELECT * FROM todos WHERE username = $1";

    let resultLists = dbQuery(ALL_TODOLISTS, this.username);
    let resultTodos = dbQuery(FIND_TODOS, this.username);
    let combinedResult = await Promise.all([resultLists, resultTodos]);

    let todoLists = combinedResult[0].rows;
    let todos = combinedResult[1].rows;

    todoLists.forEach(list => {
      list.todos = todos.filter(item => item.todolist_id === list.id);
    });

    return this._reorderTodoLists(todoLists);
  }

  async getListFromId(id) {
    const FIND_LIST = "SELECT * FROM todolists WHERE id = $1 AND username = $2";
    const FIND_TODOS = "SELECT * FROM todos WHERE todolist_id = $1 AND username = $2 ORDER BY done, title";

    let list = dbQuery(FIND_LIST, id, this.username);
    let todos = dbQuery(FIND_TODOS, id, this.username);
    let queryResults = await Promise.all([list, todos]);

    let todoList = queryResults[0].rows[0];
    todoList.todos = queryResults[1].rows;

    return todoList;
  }

  getTodoFromList(todoId, list) {
    return list.todos.find(item => item.id === todoId);
  }

  async toggleTodo(listId, todoId) {
    const TOGGLE = "UPDATE todos SET done = NOT done WHERE todolist_id = $1 AND id = $2 AND username = $3";
    await dbQuery(TOGGLE, listId, todoId, this.username);
  }

  async deleteTodo(listId, todoId) {
    const DELETE_TODO = "DELETE FROM todos WHERE todolist_id = $1 AND id = $2 AND username = $3";
    await dbQuery(DELETE_TODO, listId, todoId, this.username);
  }

  async markListDone(listId) {
    const MARK_DONE = "UPDATE todos SET done = true WHERE todolist_id = $1 AND username = $2 AND done = false";
    await dbQuery(MARK_DONE, listId, this.username);
  }

  async addTodo(listId, title) {
    const ADD_TODO = "INSERT INTO todos (todolist_id, title, username) VALUES ($1, $2, $3)";
    await dbQuery(ADD_TODO, listId, title, this.username);
  }

  async newList(title) {
    const NEW_LIST = "INSERT INTO todolists (title, username) VALUES ($1, $2)";
    await dbQuery(NEW_LIST, title, this.username);
  }

  async deleteList(listId) {
    const DELETE_LIST = "DELETE FROM todolists WHERE id = $1 AND username = $2";
    await dbQuery(DELETE_LIST, listId, this.username);
  }

  async setListTitle(listId, title) {
    const SET_LIST_TITLE = "UPDATE todolists SET title = $2 WHERE id = $1 AND username = $3";
    await dbQuery(SET_LIST_TITLE, listId, title, this.username); 
  }

  async validTitle(title) {
    const CHECK_TITLE = "SELECT * FROM todolists WHERE title = $1m AND username = $2";
    let result = await dbQuery(CHECK_TITLE, title, this.username);
    return result.rowCount === 0;
  }

  uniqueConstraintViolation(error) {
    let regexp1 = new RegExp("unique", "gi");
    let regexp2 = new RegExp("constraint", "gi");
    return regexp1.test(String(error)) && regexp2.test(String(error));
  }
};