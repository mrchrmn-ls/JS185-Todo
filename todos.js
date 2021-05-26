/* eslint-disable max-statements */
/* eslint-disable max-lines-per-function */
const config = require("./lib/config");
const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const store = require("connect-loki");
const { persistence } = require("./lib/get-config");
const Persistence = require(persistence);
const catchError = require("./lib/catch-error");

const { sortByTitle, sortByStatus } = require("./lib/sort");

const app = express();
const HOST = config.HOST;
const PORT = config.PORT;
const LokiStore = store(session);


// SignIn check middleware
const requiresAuthentication = (req, res, next) => {
  if(!res.locals.signedIn) {
    res.redirect(302, "/users/signin");
  } else {
    next();
  }
}



app.set("view engine", "pug");
app.set("views", "./views");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 3600000,
    path: "/",
    secure: false
  },
  name: "launch-school-todos-session-id",
  resave: false,
  saveUninitialized: true,
  secret: config.SECRET,
  store: new LokiStore({})
}));

app.use(flash());


// Create a new datastore
app.use((req, res, next) => {
  res.locals.store = new Persistence(req.session);
  next();
});


// Extract session info
app.use((req, res, next) => {
  res.locals.username = req.session.username;
  res.locals.signedIn = req.session.signedIn;
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});


// Redirect start page
app.get("/", (_req, res) => {
  res.redirect("/lists");
});


//Display sign-in page
app.get("/users/signin", (req, res) => {
  req.flash("info", "Please sign in.");
  res.render("signin", {
    flash: req.flash()
  });
});


// Signing in
app.post("/users/signin", catchError(
  async (req, res) => {
    let username = req.body.username.trim();
    let password = req.body.password;
    let authenticated = await res.locals.store.userAuthenticated(username, password)

    if (!authenticated) {
      req.flash("error", "Invalid credentials.");
      res.render("signin", {
        flash: req.flash(),
        username
      });
    } else {
      req.session.username = username;
      req.session.signedIn = true;
      req.flash("info", "Welcome!");
      res.redirect(`/lists`);
    }
  }
));


// Signing out
app.post("/users/signout", catchError(
  (req, res) => {
    delete req.session.signedIn;
    delete req.session.username;
    res.redirect("/users/signin");
  }
))


// Display all lists
app.get("/lists", requiresAuthentication, catchError(
  async (_req, res) => {

    let store = res.locals.store;
    let todoLists = await store.getSortedLists();

    let todosInfo = todoLists.map(list => ({
      countAllTodos: list.todos.length,
      countDoneTodos: list.todos.filter(todo => todo.done).length,
      isDone: store.listDone(list)
    }));

    res.render("lists", { todoLists, todosInfo });
  })
);


// Display new list form
app.get("/lists/new", requiresAuthentication, (req, res) => {
  if (req.session.signedIn) {
    res.render("new-list");
  } else {
    res.send("Not authorized.");
  }
});


//Display single list
app.get("/lists/:todoListId", requiresAuthentication, catchError(
  async (req, res) => {
    let store = res.locals.store;
    let listId = Number(req.params.todoListId);
    let list = await store.getListFromId(listId);

    if (!list) {
      throw new Error("Todo list not found.");
    } else {
      res.render("list", {
        todoList: list,
        listDone: store.listDone(list),
        somethingLeftToDo: store.somethingLeftToDo(list),
        todos: sortByStatus(sortByTitle(list.todos))
      });
    }
  })
);


// Display list editing view
app.get("/lists/:todoListId/edit", requiresAuthentication, catchError(
  async (req, res) => {
    let listId = Number(req.params.todoListId);
    let list = await res.locals.store.getListFromId(listId);

    if (!list) {
      throw new Error("Todo list not found.");
    } else {
      res.render("edit-list", {
        todoList: list
      });
    }
  }
));


// Delete todo list
app.post("/lists/:todoListId/destroy", requiresAuthentication, catchError(
  async (req, res) => {
    let store = res.locals.store;
    let listId = Number(req.params.todoListId);
    let list = await store.getListFromId(listId);

    if (!list) {
      throw new Error("Todo list not found.");
    } else {
      await store.deleteList(listId);
      req.flash("success", `List "${list.title}" deleted.`);
      res.redirect("/lists");
    }
  }
));


// Edit title of todo list
app.post("/lists/:todoListId/edit",
  [
    body("todoListTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("You need to provide a title.")
      .isLength({ max: 100 })
      .withMessage("Title must be shorter than 100 characters.")
  ],
  requiresAuthentication, catchError(
    async (req, res) => {
      let store = res.locals.store;
      let listId = Number(req.params.todoListId);
      let list = await store.getListFromId(listId);
      let title = req.body.todoListTitle;

      const reRenderEditList = () => {
        res.render("edit-list", {
          flash: req.flash(),
          todoListTitle: title,
          todoList: list
        });
      };

      try {
        if (!list) {
          throw new Error("Todo list not found.");
        } else {
          let errors = validationResult(req);

          if (!(await store.validTitle(title))) {
            req.flash("error", "A list with this title already exists.");
            reRenderEditList();
          } else if (!errors.isEmpty()) {
            errors.array().forEach(message => req.flash("error", message.msg));
            reRenderEditList();
          } else {
            req.flash("success", `"${list.title}" has been renamed "${title}".`);
            await store.setListTitle(listId, title);
            res.redirect("/lists");
          }
        }
      } catch (error) {
        if (store.uniqueConstraintViolation(error)) {
          req.flash("error", "The list title must (!) be unique.");
          reRenderEditList();
        } else {
          throw error;
        }
      }
    }
  )
);


// Mark all todo items as done
app.post("/lists/:todoListId/complete_all", requiresAuthentication, catchError(
  async (req, res) => {
    let store = res.locals.store;
    let listId = Number(req.params.todoListId);
    let list = await store.getListFromId(listId);
      
    if (!list) {
      throw new Error("Todo list not found.");
    } else {
      await store.markListDone(listId);
      res.redirect(`/lists/${listId}`);
    }
  }
));


// Toggle status of todo item
app.post("/lists/:todoListId/todos/:todoId/toggle", requiresAuthentication, catchError(
  async (req, res) => {
    let store = res.locals.store;
    let todoId = Number(req.params.todoId);
    let listId = Number(req.params.todoListId);
    let list = await store.getListFromId(listId);

    if (!list) {
      throw new Error("Todo list not found.");
    } else {
      let todo = store.getTodoFromList(todoId, list);
      if (!todo) {
        throw new Error("Todo item not found.");
      } else {
        await store.toggleTodo(listId, todoId);
        if (req.body.done) {
          req.flash("success", `"${todo.title}" marked complete.`);
        } else {
          req.flash("success", `"${todo.title}" unchecked.`);
        }
        res.redirect(`/lists/${listId}`);
      }
    }
  }
));


// Delete todo item
app.post("/lists/:todoListId/todos/:todoId/destroy", requiresAuthentication, catchError(
  async (req, res) => {
    let store = res.locals.store;
    let todoId = Number(req.params.todoId);
    let listId = Number(req.params.todoListId);
    let list = await store.getListFromId(listId);

    if (!list) {
      throw new Error("Todo list not found.");
    } else {
      let todo = store.getTodoFromList(todoId, list);
      if (!todo) {
        throw new Error("Todo item not found.");
      } else {
        await store.deleteTodo(listId, todoId);
        req.flash("success", `"${todo.title}" removed from list.`);
        res.redirect(`/lists/${listId}`);
      }
    }
  }
));


// Add new todo item
app.post("/lists/:todoListId/todos",
  [
    body("todoTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("You need to name your todo item.")
      .isLength({ max: 100 })
      .withMessage("Item name must not exceed 100 characters.")
  ],
  requiresAuthentication, catchError(
    async (req, res) => {
      let store = res.locals.store;
      let listId = Number(req.params.todoListId);
      let list = await store.getListFromId(listId);

      if (!list) {
        throw new Error("Todo list not found.");
      } else {
        let title = req.body.todoTitle;
        let errors = validationResult(req);

        if (!errors.isEmpty) {
          errors.array().forEach(message => req.flash("error", message.msg));
          res.render(`/lists/${listId}`, {
            flash: req.flash(),
            todoTitle: title
          });
        } else {
          await store.addTodo(listId, title);
          req.flash("success", `"${title}" added to list.`);
          res.redirect(`/lists/${listId}`);
        }
      }
    }
  )
);


// Add new list
app.post("/lists",
  [
    body("todoListTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("You need to provide a title.")
      .isLength({ max: 100 })
      .withMessage("Title must be shorter than 100 characters.")
  ],
  requiresAuthentication, catchError(
    async (req, res) => {
      let title = req.body.todoListTitle;
      let errors = validationResult(req);
      let store = res.locals.store;

      const reRenderNewList = () => {
        res.render("new-list", {
          flash: req.flash(),
          todoListTitle: title
        });
      };
      
      try {
        if (!(await store.validTitle(title))) {
          req.flash("error", "There is already a list with this title.");
          reRenderNewList();
        } else if (!errors.isEmpty()) {
          errors.array().forEach(message => req.flash("error", message.msg));
          reRenderNewList();
        } else {
          await store.newList(title);
          req.flash("success", `The list "${title}" has been added.`);
          res.redirect("/lists");
        }
      } catch (error) {
        if (store.uniqueConstraintViolation(error)) {
          req.flash("error", "The list title must (!) be unique.");
          reRenderNewList();
        } else {
          throw error;
        }
      }
    }
  )
);


// Error handler
app.use((err, _req, res, _next) => {
  console.log(err);
  res.status(404)
     .send(err.message);
});


// Listener
app.listen(PORT, HOST, () => {
  console.log(`Todos listening on port ${PORT} of ${HOST}.`);
});