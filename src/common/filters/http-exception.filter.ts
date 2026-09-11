import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();

        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        const exceptionResponse =
            exception instanceof HttpException
                ? exception.getResponse()
                : null;

        let message = 'Internal server error';
        let error = 'Internal Server Error';

        if (typeof exceptionResponse === 'string') {
            message = exceptionResponse;
        } else if (
            exceptionResponse &&
            typeof exceptionResponse === 'object'
        ) {
            const body = exceptionResponse as {
                message?: string | string[];
                error?: string;
            };

            if (Array.isArray(body.message)) {
                message = body.message.join(', ');
            } else if (body.message) {
                message = body.message;
            }

            if (body.error) {
                error = body.error;
            }
        }

        response.status(status).json({
            success: false,
            message,
            error,
            statusCode: status,
            path: request.url,
            timestamp: new Date().toISOString(),
        });
    }
}