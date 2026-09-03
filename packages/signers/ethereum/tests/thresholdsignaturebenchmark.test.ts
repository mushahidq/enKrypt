import { describe, it, expect } from "vitest";
import { bufferToHex, hexToBuffer, WebSocketClient } from "@enkryptcom/utils";
import { privateToPublic } from "@ethereumjs/util";
import { EthereumSigner } from "../src";
import { verify } from "@noble/secp256k1";

describe("Ethreum threhsold signing", async () => {
  const echash =
    "82ff40c0a986c6a5cfad4ddf4c3aa6996f1a7837f9c398e17e5de5cbd5a12b28";

  const sessionId = "session id";
  const p1KeyShare = {
    x1: 'cd564d13bae14831c8994c2fb684ee4116a114e694fcebc0f3c94ceb0b563a71',
    public_key: 'd377dee1d7272b70c37b4542c824727c00141dbc0b8eb94f05bbee2e200b9340f86674e06dd6b37cc172891b22b8776585e5d7fd9658e04942c3c5f1b81c1814',
    paillier_private_key: {
      p: 'Ac6r06pPhlAEIklSIcdkbNrkRtoK2+sjWUF8/0BCDxTNgr2Yve4AWq9inucoRaekEKFDp4RdzD5RiT9LjuahIlmctpPmAi0DtdehRuSDpj+6fKN38vu7JH4CtCZ7HgCj9rKIoRD8whMWqPEV9FBCT8j/A/Qq+il3fZpCgNoPvd0P',
      q: 'hrw34sJ7Ghkhq4cwBTM/vcQhcumB/qkB9bzmqnYYCOpVncur6+A/ECO5eQ0FDtMBq+CCDxL/V2Dgkllem9TX7snWZW0HmxiD8TC3D4yveJy4wdACj8xLoHJUF4gMQg3v6Tc0w4qw+yMLF4UJoHiBfg2zWrUnMDMyk94gulYgRjc='
    },
    paillier_public_key: '84Ib+1RZ2hWe+DMdvgLxNXCSZqy4mr+99AYoLXjRt64Zv+GheamxpiUOBaKpHe5Pakev680iJCHTlVCRRTcsjx0r5BF/z6FIUe7Z9/u0oulJaMADIv+gpM+G3+UwkieQAsKCFDt7lnbyWgzAbGeTat9W9NAcX01CnRjAsmBzrfVHa6OmeeZA7YFFBj932/fkoipMpD2MvL0M8jP9TJtQEg/dsQzsCDvJgdafRhMkynksQYblLXeuaUuk5WBA5W3agKw/wtFs+Djnzd0Wkjw2ps1UWRo0EgEF9PE9wuSQHVLc6ZWueZquil5Xmk/ClgTwevnwxTGaWq4rp4wL+ByYOQ=='
  }

  const socketClientOptions = {
    host: "127.0.0.1",
    port: "54545",
  }


  it("it should sign correctly 100 times", async () => {
    const ethreumSigner = new EthereumSigner();
    const executionTimes: number[] = [];

    for (let iteration = 0; iteration < 100; iteration += 1) {
      const start = process.hrtime.bigint();
      const signature = await ethreumSigner.thresholdSign(
        echash,
        socketClientOptions,
        sessionId,
        p1KeyShare,
      );
      const end = process.hrtime.bigint();
      executionTimes.push(Number(end - start) / 1_000_000);

      expect(verify(signature, echash, "04" + p1KeyShare.public_key)).equals(
        true,
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
