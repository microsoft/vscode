const request = require('supertest');
const API = require('../src/api');

describe('API', () => {
  let api;
  let database;

  beforeAll(() => {
    database = {
      getAllBooks: jest.fn(),
      getBooksByAuthor: jest.fn(),
      getBooksByTitle: jest.fn(),
    };
    api = new API(database);
  });

  describe('GET /books', () => {
    it('should return all books', async () => {
      const mockBooks = [{ title: 'Book 1' }, { title: 'Book 2' }];
      database.getAllBooks.mockResolvedValue(mockBooks);

      const response = await request(api.app).get('/books');

      expect(database.getAllBooks).toHaveBeenCalled();
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockBooks);
    });
  });

  describe('GET /books/author/:author', () => {
    it('should return books by author', async () => {
      const mockAuthor = 'John Doe';
      const mockBooks = [{ title: 'Book 1', author: mockAuthor }, { title: 'Book 2', author: mockAuthor }];
      database.getBooksByAuthor.mockResolvedValue(mockBooks);

      const response = await request(api.app).get(`/books/author/${mockAuthor}`);

      expect(database.getBooksByAuthor).toHaveBeenCalledWith(mockAuthor);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockBooks);
    });
  });

  describe('GET /books/title/:title', () => {
    it('should return books by title', async () => {
      const mockTitle = 'Book 1';
      const mockBooks = [{ title: mockTitle, author: 'John Doe' }];
      database.getBooksByTitle.mockResolvedValue(mockBooks);

      const response = await request(api.app).get(`/books/title/${mockTitle}`);

      expect(database.getBooksByTitle).toHaveBeenCalledWith(mockTitle);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockBooks);
    });
  });
});
