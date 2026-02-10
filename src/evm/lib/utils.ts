import { tryCatchAsync } from "@zlikemario/helper/utils";
import type { AnyFn } from "@zlikemario/helper/types";

export function createEVMContractEvent<EventReturn>(
  target: string,
  createEvent: (onCallback: (log: EventReturn) => void, onError: (err: Error) => void) => AnyFn,
) {
  const dataCallbacks = new Set<(pair: Partial<EventReturn>) => any>();
  const errorCallbacks = new Set<(err: Error) => any>();

  let watchState: "idle" | "creating" | "active" = "idle";
  let subscriberCount = 0;
  let creatingPromise: Promise<void> | undefined;

  let unwatchEvent: (() => void) | undefined;

  const ensureWatchCreated = () => {
    if (creatingPromise) return creatingPromise; // 如果正在创建，则不再重复创建
    if (watchState === "active") return; // 已经在 active 状态下，直接返回

    watchState = "creating";

    creatingPromise = new Promise<void>((resolve) => {
      const unwatch = createEvent(
        (data) => {
          dataCallbacks.forEach((fn) => tryCatchAsync(fn(data)));
        },
        (err) => {
          errorCallbacks.forEach((fn) => tryCatchAsync(fn(err)));
          if (!errorCallbacks.size) {
            console.error(target, err);
          }
        },
      );

      unwatchEvent = () => {
        unwatch();
        unwatchEvent = undefined;
        watchState = "idle";
        creatingPromise = undefined;
        resolve();
      };

      watchState = "active";
    });

    return creatingPromise;
  };

  return async (options: { onCallback: (pair: Partial<EventReturn>) => any; onError?: (err: Error) => any }) => {
    dataCallbacks.add(options.onCallback);
    if (options.onError) errorCallbacks.add(options.onError);

    let active = true;
    subscriberCount++;
    await ensureWatchCreated();

    return () => {
      if (!active) return;
      active = false;
      dataCallbacks.delete(options.onCallback);
      if (options.onError) errorCallbacks.delete(options.onError);

      subscriberCount--;
      if (subscriberCount === 0) {
        unwatchEvent?.();
      }
      if (subscriberCount < 0) {
        console.error("subscriberCount corrupted");
        unwatchEvent?.(); // 确保清理
        throw new Error("subscriberCount corrupted");
      }
    };
  };
}
