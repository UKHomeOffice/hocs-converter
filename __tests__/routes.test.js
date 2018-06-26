/* global describe test expect */
const request = require('supertest');
const errors = require('../libs/errors');

describe('POST /api', () => {

    test('should return 400 when no file passed', () => {
        return request('http://localhost:8080')
            .post('/api')
            .expect(400)
            .then(response => {
                expect(response.body).toHaveProperty('status', errors.NO_FILE);
            });
    });

    test('should return 400 when unsupported file extension passed', () => {
        return request('http://localhost:8080')
            .post('/api')
            .attach('file', '__tests__/resources/sample.test')
            .then(response => {
                expect(response.body).toHaveProperty('status', errors.UNSUPPORTED_TYPE);
            });
    });

    test('should return 400 when unsupported file mime-type passed', () => {
        return request('http://localhost:8080')
            .post('/api')
            .attach('file', '__tests__/resources/isReallyAnImage.doc')
            .expect('Content-Type', /json/)
            .expect(400)
            .then(response => {
                expect(response.body).toHaveProperty('status', errors.UNSUPPORTED_TYPE);
            });
    });
  
    test.skip('should error if virus passed', () => {
        return request('http://localhost:8080')
            .post('/api')
            .attach('file', '__tests__/resources/eicar.com.txt')
            .expect('Content-Type', /json/)
            .expect(200)
            .then(response => {
                expect(response.body).toHaveProperty('status', errors.MALWARE_FOUND);
            });
    });
    if (process.env.OUTPUT_PDF) {
    
        test('should return 200 and pdf when .txt passed', () => {
            return request('http://localhost:8080')
                .post('/api')
                .attach('file', '__tests__/resources/sample.txt')
                .expect('Content-Type', /pdf/)
                .expect(200);
        });
  
        test('should return 200 and pdf when .rtf passed', () => {
            return request('http://localhost:8080')
                .post('/api')
                .attach('file', '__tests__/resources/sample.rtf')
                .expect('Content-Type', /pdf/)
                .expect(200);
        });
  
        test('should return 200 and pdf when .docx passed', () => {
            return request('http://localhost:8080')
                .post('/api')
                .attach('file', '__tests__/resources/sample.docx')
                .expect('Content-Type', /pdf/)
                .expect(200);
        });
  
        test('should return 200 and pdf when .doc passed', () => {
            return request('http://localhost:8080')
                .post('/api')
                .attach('file', '__tests__/resources/sample.doc')
                .expect('Content-Type', /pdf/)
                .expect(200);
        });
  
        test('should return 200 and pdf when .html passed', () => {
            return request('http://localhost:8080')
                .post('/api')
                .attach('file', '__tests__/resources/sample.html')
                .expect('Content-Type', /pdf/)
                .expect(200);
        });
      
    } else {
    
        test('should return 200 and JSON when .txt passed', () => {
            return request('http://localhost:8080')
                .post('/api')
                .attach('file', '__tests__/resources/sample.txt')
                .expect('Content-Type', /json/)
                .expect(200)
                .then(response => {
                    expect(response.body).toHaveProperty('status', errors.CONVERSION_OK);
                });
        });
  
        test('should return 200 and JSON when .rtf passed', () => {
            return request('http://localhost:8080')
                .post('/api')
                .attach('file', '__tests__/resources/sample.rtf')
                .expect('Content-Type', /json/)
                .expect(200)
                .then(response => {
                    expect(response.body).toHaveProperty('status', errors.CONVERSION_OK);
                });
        });
  
        test('should return 200 and JSON when .docx passed', () => {
            return request('http://localhost:8080')
                .post('/api')
                .attach('file', '__tests__/resources/sample.docx')
                .expect('Content-Type', /json/)
                .expect(200)
                .then(response => {
                    expect(response.body).toHaveProperty('status', errors.CONVERSION_OK);
                });
        });
  
        test('should return 200 and JSON when .doc passed', () => {
            return request('http://localhost:8080')
                .post('/api')
                .attach('file', '__tests__/resources/sample.doc')
                .expect('Content-Type', /json/)
                .expect(200)
                .then(response => {
                    expect(response.body).toHaveProperty('status', errors.CONVERSION_OK);
                });
        });
  
        test('should return 200 and JSON when .html passed', () => {
            return request('http://localhost:8080')
                .post('/api')
                .attach('file', '__tests__/resources/sample.html')
                .expect('Content-Type', /json/)
                .expect(200)
                .then(response => {
                    expect(response.body).toHaveProperty('status', errors.CONVERSION_OK);
                });
        });
    }

});
