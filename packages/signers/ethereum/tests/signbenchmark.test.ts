import { describe, it, expect } from "vitest";
import { bufferToHex, hexToBuffer } from "@enkryptcom/utils";
import { privateToPublic } from "@ethereumjs/util";
import { EthereumSigner } from "../src";

describe("Ethreum signing", () => {
  const echash =
    "82ff40c0a986c6a5cfad4ddf4c3aa6996f1a7837f9c398e17e5de5cbd5a12b28";
  const ecprivkey =
    "3c9229289a6125f7fdf1885a77bb12c37a8d3b4962d936f7e3084dece32a3ca1";
  const ecpair = {
    publicKey: bufferToHex(privateToPublic(hexToBuffer(ecprivkey))),
    privateKey: ecprivkey,
  };
  it("it should sign correctly", async () => {
    const ethreumSigner = new EthereumSigner();
    const executionTimes: number[] = [];

    for (let iteration = 0; iteration < 100; iteration += 1) {
      const start = process.hrtime.bigint();
      const signature = await ethreumSigner.sign(echash, ecpair);
      const end = process.hrtime.bigint();
      executionTimes.push(Number(end - start) / 1_000_000);

      expect(signature).equals(
        "0x99e71a99cb2270b8cac5254f9e99b6210c6c10224a1579cf389ef88b20a1abe9129ff05af364204442bdb53ab6f18a99ab48acc9326fa689f228040429e3ca661b",
      );

    }

    const mean =
      executionTimes.reduce((total, time) => total + time, 0) /
      executionTimes.length;
    const min = Math.min(...executionTimes);
    const max = Math.max(...executionTimes);

    console.log(
      `thresholdSign timings for ${executionTimes.length} executions: ` +
      `mean=${mean.toFixed(2)} ms, min=${min.toFixed(2)} ms, max=${max.toFixed(2)} ms`,
    );
  }, 300_000);
});
