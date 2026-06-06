import { reconcileActiveOrderEntries } from "../src/services/reconcile.js";

const result = await reconcileActiveOrderEntries();
console.log(JSON.stringify(result, null, 2));
