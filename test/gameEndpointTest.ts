import path from "path";
require("dotenv").config({ path: path.join(process.cwd(), ".env") });
import { expect } from "chai";
import { Server } from "http";
import fetch from "node-fetch";
import "mocha";
import mongo, { MongoClient } from "mongodb";
import { bryptAsync } from "../src/utils/bcrypt-async-helper";
import setup from "../src/config/setupDB";
import {
  positionCreator,
  getLatitudeInside,
  getLatitudeOutside,
} from "../src/utils/geoUtils";
import {
  USER_COLLECTION_NAME,
  POSITION_COLLECTION_NAME,
  POST_COLLECTION_NAME,
} from "../src/config/collectionNames";

let server: Server;
const TEST_PORT = "7777";
let client: MongoClient;
const DISTANCE_TO_SEARCH = 100;
const MOCHA_TIMEOUT = 5000;

describe("Verify /gameapi/getPostIfReached", () => {
  let URL: string;

  //IMPORTANT --> this does now work with Mocha for ARROW-functions
  before(async function () {
    //@ts-ignore
    this.timeout(MOCHA_TIMEOUT);

    process.env["PORT"] = TEST_PORT;
    process.env["DB_NAME"] = "semester_case_test";

    server = await require("../src/app").server;
    URL = `http://localhost:${process.env.PORT}`;
    client = await setup();
    //This is not required. The server connects to the DB via the use of the facade
    //await client.connect();
  });

  beforeEach(async () => {
    //Observe, no use of facade, but operates directly on connection
    // client = await setup();
    // await client.connect();
    const db = client.db(process.env.DB_NAME);
    const usersCollection = db.collection(USER_COLLECTION_NAME);
    await usersCollection.deleteMany({});
    const secretHashed = await bryptAsync("secret");
    const team1 = {
      name: "Team1",
      userName: "t1",
      password: secretHashed,
      role: "team",
    };
    const team2 = {
      name: "Team2",
      userName: "t2",
      password: secretHashed,
      role: "team",
    };
    const team3 = {
      name: "Team3",
      userName: "t3",
      password: secretHashed,
      role: "team",
    };
    const team4 = {
      name: "Team4",
      userName: "t4",
      password: secretHashed,
      role: "team",
    };
    const team5 = {
      name: "Team5",
      userName: "t5",
      password: secretHashed,
      role: "team",
    };

    const status = await usersCollection.insertMany([
      team1,
      team2,
      team3,
      // team4,
      // team5
    ]);

    // MAKE COLLECTION
    const positionsCollection = db.collection(POSITION_COLLECTION_NAME);
    // DELETE MANY
    await positionsCollection.deleteMany({});
    // CREATE INDEX
    await positionsCollection.createIndex(
      { lastUpdated: 1 },
      { expireAfterSeconds: 30 }
    );
    await positionsCollection.createIndex({ location: "2dsphere" });
    // CREATE THINGS TO PUT IN COLLECTION
    const positions = [
      positionCreator(12.48, 55.77, team1.userName, team1.name, true),
      //TODO --> Change latitude below, to a value INSIDE the radius given by DISTANCE_TO_SEARC, and the position of team1
      positionCreator(
        12.48,
        getLatitudeInside(55.77, DISTANCE_TO_SEARCH),
        team2.userName,
        team2.name,
        true
      ),
      //TODO --> Change latitude below, to a value OUTSIDE the radius given by DISTANCE_TO_SEARC, and the position of team1
      positionCreator(
        12.48,
        getLatitudeOutside(55.77, DISTANCE_TO_SEARCH),
        team3.userName,
        team3.name,
        true
      ),
      // // POSITION FOR POST OUTSIDE
      // positionCreator(
      //   12.48,
      //   getLatitudeOutside(55.77, 10),
      //   team4.userName,
      //   team4.name,
      //   true
      // ),
      // // POSITION FOR POST INSIDE
      // positionCreator(
      //   12.48,
      //   getLatitudeInside(55.77, 10),
      //   team5.userName,
      //   team5.name,
      //   true
      // )
    ];
    // INSERT INTO COLLECTION
    const locations = await positionsCollection.insertMany(positions);

    // POSTS
    // MAKE COLLECTION
    const postCollection = db.collection(POST_COLLECTION_NAME);
    // DELETE MANY
    await postCollection.deleteMany({});
    // CREATE INDEX
    await postCollection.createIndex({ location: "2dsphere" });
    // CREATE THINGS TO PUT IN COLLECTION
    const post = {
      _id: "Post",
      task: { text: "test", isUrl: true },
      taskSolution: "test",
      location: { type: "Point", coordinates: [12.48, 55.77] },
    };
    // INSERT INTO COLLECTION
    await postCollection.insertOne(post);

    //console.log(await postCollection.find({}));
  });

  after(async () => {
    server.close();
    await client.close();
  });

  it("Should find team2, since inside range", async function () {
    //  //@ts-ignore
    //  this.timeout(MOCHA_TIMEOUT)
    const newPosition = {
      userName: "t1",
      password: "secret",
      lon: 12.48,
      lat: 55.77,
      distance: DISTANCE_TO_SEARCH,
    };
    const config = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newPosition),
    };
    const result = await fetch(
      `${URL}/gameapi/nearbyplayers`,
      config
    ).then((r) => r.json());
    expect(result.length).to.be.equal(1);
    expect(result[0].name).to.be.equal("Team2");
  });

  it("Should find team2 +team3, since both are inside range", async function () {
    const newPosition = {
      userName: "t1",
      password: "secret",
      lon: 12.48,
      lat: 55.77,
      distance: DISTANCE_TO_SEARCH + 1,
    };
    const config = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newPosition),
    };
    const result = await fetch(
      `${URL}/gameapi/nearbyplayers`,
      config
    ).then((r) => r.json());
    expect(result.length).to.be.equal(2);
    expect(result[0].name).to.be.equal("Team2");
    expect(result[1].name).to.be.equal("Team3");
    //TODO
  });

  it("Should NOT find team2, since not in range", async function () {
    const newPosition = {
      userName: "t1",
      password: "secret",
      lon: 12.48,
      lat: 55.77,
      distance: DISTANCE_TO_SEARCH - 2,
    };
    const config = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newPosition),
    };
    const result = await fetch(
      `${URL}/gameapi/nearbyplayers`,
      config
    ).then((r) => r.json());
    expect(result.length).to.be.equal(0);
  });

  it("Should NOT find team2, since credential are wrong", async function () {
    const newPosition = {
      userName: "t1",
      password: "asdasdasgafadfsaad",
      lon: 12.48,
      lat: 55.77,
      distance: DISTANCE_TO_SEARCH,
    };
    const config = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newPosition),
    };
    const result = await fetch(
      `${URL}/gameapi/nearbyplayers`,
      config
    ).then((r) => r.json());
    expect(result.message).to.be.equal("wrong username or password");
    expect(result.code).to.be.equal(403);
  });

  /**
   * const post = {
      _id: "Post",
      task: { text: "test", isURL: true },
      taskSolution: "test",
      location: { type: "Point", coordinates: [12.48, 55.77] }
    };
   */

  it("Should find post, since point in range", async () => {
    const newPosition = {
      postId: "Post",
      lon: 12.48,
      lat: 55.77,
    };
    const config = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newPosition),
    };
    const result = await fetch(
      `${URL}/gameapi/getPostIfReached`,
      config
    ).then((r) => r.json());
    expect(result.postId).to.be.equal("Post");
    expect(result.task).to.be.equal("test");
    expect(result.isUrl).to.be.true;
  });

  it("Should NOT find post, since point NOT in range", async () => {
    const newPosition = {
      postId: "Post",
      lon: 12,
      lat: 55,
    };
    const config = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newPosition),
    };
    const result = await fetch(
      `${URL}/gameapi/getPostIfReached`,
      config
    ).then((r) => r.json());
    // new ApiError("Post not reached", 400);
    expect(result.message).to.be.equal("Post not reached");
    expect(result.code).to.be.equal(400);
  });
});
