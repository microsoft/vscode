/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

pub struct RingBuffer<T> {
	data: Vec<T>,
	i: usize,
}

impl<T> RingBuffer<T> {
	pub fn new(capacity: usize) -> Self {
		Self {
			data: Vec::with_capacity(capacity),
			i: 0,
		}
	}

	pub fn capacity(&self) -> usize {
		self.data.capacity()
	}

	pub fn len(&self) -> usize {
		self.data.len()
	}

	pub fn is_full(&self) -> bool {
		self.data.len() == self.data.capacity()
	}

	pub fn is_empty(&self) -> bool {
		self.data.len() == 0
	}

	pub fn push(&mut self, value: T) {
		if self.data.len() == self.data.capacity() {
			self.data[self.i] = value;
		} else {
			self.data.push(value);
		}

		self.i = (self.i + 1) % self.data.capacity();
	}

	pub fn iter(&self) -> RingBufferIter<'_, T> {
		RingBufferIter {
			index: 0,
			buffer: self,
		}
	}
}

impl<T: Default> IntoIterator for RingBuffer<T> {
	type Item = T;
	type IntoIter = OwnedRingBufferIter<T>;

	fn into_iter(self) -> OwnedRingBufferIter<T>
	where
		T: Default,
	{
		OwnedRingBufferIter {
			index: 0,
			buffer: self,
		}
	}
}

pub struct OwnedRingBufferIter<T: Default> {
	buffer: RingBuffer<T>,
	index: usize,
}

impl<T: Default> Iterator for OwnedRingBufferIter<T> {
	type Item = T;

	fn next(&mut self) -> Option<Self::Item> {
		if self.index == self.buffer.len() {
			return None;
		}

		let ii = (self.index + self.buffer.i) % self.buffer.len();
		let item = std::mem::take(&mut self.buffer.data[ii]);
		self.index += 1;
		Some(item)
	}
}

pub struct RingBufferIter<'a, T> {
	buffer: &'a RingBuffer<T>,
	index: usize,
}

impl<'a, T> Iterator for RingBufferIter<'a, T> {
	type Item = &'a T;

	fn next(&mut self) -> Option<Self::Item> {
		if self.index == self.buffer.len() {
			return None;
		}

		let ii = (self.index + self.buffer.i) % self.buffer.len();
		let item = &self.buffer.data[ii];
		self.index += 1;
		Some(item)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn test_inserts() {
		let mut rb = RingBuffer::new(3);
		assert_eq!(rb.capacity(), 3);
		assert!(!rb.is_full());
		assert_eq!(rb.len(), 0);
		assert_eq!(rb.iter().copied().count(), 0);

		rb.push(1);
		assert!(!rb.is_full());
		assert_eq!(rb.len(), 1);
		assert_eq!(rb.iter().copied().collect::<Vec<i32>>(), vec![1]);

		rb.push(2);
		assert!(!rb.is_full());
		assert_eq!(rb.len(), 2);
		assert_eq!(rb.iter().copied().collect::<Vec<i32>>(), vec![1, 2]);

		rb.push(3);
		assert!(rb.is_full());
		assert_eq!(rb.len(), 3);
		assert_eq!(rb.iter().copied().collect::<Vec<i32>>(), vec![1, 2, 3]);

		rb.push(4);
		assert!(rb.is_full());
		assert_eq!(rb.len(), 3);
		assert_eq!(rb.iter().copied().collect::<Vec<i32>>(), vec![2, 3, 4]);

		assert_eq!(rb.into_iter().collect::<Vec<i32>>(), vec![2, 3, 4]);
	}
}
