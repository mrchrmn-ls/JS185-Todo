CREATE TABLE todolists (
  id serial PRIMARY KEY,
  title text UNIQUE NOT NULL,
  username text NOT NULL
);

CREATE TABLE todos (
  id serial PRIMARY KEY,
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  todolist_id integer NOT NULL REFERENCES todolists (id) ON DELETE CASCADE,
  username text NOT NULL
);

CREATE TABLE users (
  username text PRIMARY KEY,
  password text NOT NULL
);