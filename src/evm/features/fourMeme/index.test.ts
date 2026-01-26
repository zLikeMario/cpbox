import { describe } from "vitest";
import FourMeme from "./index";

const TEST_TOKEN_ADDRESS = import.meta.env.VITE_TEST_TOKEN_ADDRESS;
const PRIVATE_KEY = import.meta.env.VITE_COMPANY_PRIVATE_KEY;
const fourMeme = new FourMeme(FourMeme.testnet, PRIVATE_KEY);

describe("FourMeme", () => {});
