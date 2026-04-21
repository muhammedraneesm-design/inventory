import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export async function generateSKU(
  category: string,
  subcategory: string,
  type: string,
  spec: string
): Promise<string> {
  const counterId = `${category}-${subcategory}-${type}-${spec}`.toUpperCase().replace(/\s+/g, '-');
  const counterRef = doc(db, 'counters', counterId);

  return await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let count = 1;

    if (counterDoc.exists()) {
      count = counterDoc.data().count + 1;
    }

    transaction.set(counterRef, { count }, { merge: true });

    const paddedCount = count.toString().padStart(3, '0');
    return `${counterId}-${paddedCount}`;
  });
}
