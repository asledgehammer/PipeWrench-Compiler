# Create third-party library

1. Follow the tutorial on [Publishing Modules](https://typescripttolua.github.io/docs/publishing-modules/) in the typescript-to-lua documentation to create a library

2. If there is code in the library that needs to be introduced in the client and server, the generated files need to be split into the client and server. The directory example is as follows:

```txt
project
|-- client.lua
|-- server.lua
```

or

```txt
project
|-- client
|-- |-- clientA.lua
|-- |-- other client files
|-- server
|-- |-- serverA.lua
|-- |-- other server files
```

If there is a need to change the location of the client and server, corresponding configurations can be added in `package. json`, and both client and server configurations are optional.

Here is a configuration example: (Assuming that the client files and server files are located under 'dist/client' and 'dist/server', respectively)

```json
{
  // ...others
  "pzpw": {
    "client": "dist/client",
    "server": "dist/client"
  }
}
```

## QA

Q1. Why does the code introduced in the client and server need to be split?

A1. Because by default, the generated files are in shared, causing errors in the code corresponding to the client and server when running. Therefore, the code in the client and server needs to be placed in their respective directories to run properly.
