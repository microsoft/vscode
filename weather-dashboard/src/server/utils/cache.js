/**
 * Simple in-memory cache manager
 */
class CacheManager {
  constructor(ttl = 600) {
    this.cache = new Map();
    this.ttl = ttl * 1000; // Convert to milliseconds
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Optional TTL in seconds
   */
  set(key, value, ttl = this.ttl) {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl
    });
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or null
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    // Check if expired
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache stats
   * @returns {Object} Cache statistics
   */
  stats() {
    let validItems = 0;
    let expiredItems = 0;

    this.cache.forEach((item) => {
      if (Date.now() > item.expires) {
        expiredItems++;
      } else {
        validItems++;
      }
    });

    return {
      size: this.cache.size,
      validItems,
      expiredItems,
      ttl: this.ttl / 1000
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    this.cache.forEach((item, key) => {
      if (now > item.expires) {
        this.cache.delete(key);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      console.log(`🧹 Cache cleanup: removed ${cleaned} expired entries`);
    }

    return cleaned;
  }
}

// Create singleton instance
const cacheTTL = parseInt(process.env.CACHE_TTL || '600');
export const cacheManager = new CacheManager(cacheTTL);

// Clean up expired entries every 5 minutes
setInterval(() => {
  cacheManager.cleanup();
}, 5 * 60 * 1000);

export default CacheManager;
