## How to Run  

This project uses **Yarn workspaces**. Running `yarn install` in the root directory will install all dependencies.  

However, for testing purposes and to avoid setting up all environment files manually, it's recommended to start the services using **Docker Compose**:  

```sh
yarn compose:start  # Ensure Docker is running
```  

Then to start the publishing process run

```sh
yarn publisher:start   # start the python script
```

### What the Compose Stack Includes  

- 3 instances of **Consumer Service** 
- 2 instances of **Dispatcher Service** 
- **Redis** instance
- **Grafana** – for monitoring  
- **Pumba** – for chaos testing (randomly stops and restarts one container every ~15 seconds)  

Pumba helps validate **message redistribution** and tests how quickly a new leader is assigned and reconnects with consumers.  

### Additional Scripts  

There's a workspace called `scripts` that contains a simple Node.js script with two functions used for testing:  

- One function checks if any messages were **processed more than once**.  
- To use it, uncomment the relevant function, comment out the others, and run:  

  ```sh
  yarn scripts:start
  ```  

### Grafana Setup  

Once the stack is running, you can access **Grafana** on the port specified in the Compose configuration.  

To set up **Loki** and **Prometheus** as data sources, use the following format for their addresses:  

```plaintext
http://<container-name>:<container-port>
``` 

This ensures Grafana can pull the correct metrics for monitoring.