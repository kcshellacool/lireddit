import { User } from "../entities/User";
import {
  Resolver,
  Mutation,
  Query,
  Arg,
  InputType,
  Field,
  Ctx,
  ObjectType,
} from "type-graphql";
import { MyContext } from "src/types";
import argon2 from "argon2";
import { RequiredEntityData } from "@mikro-orm/core";

@InputType()
class UsernamePasswordInput {
  @Field()
  username: string;
  @Field()
  password: string;
}

@ObjectType()
class FieldError {
  @Field()
  field: string;
  @Field()
  message: string;
}

@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[];

  @Field(() => User, { nullable: true })
  user?: User;
}

@Resolver()
export class UserResolver {
  @Query(() => [User])
  users(@Ctx() { em }: MyContext): Promise<User[]> {
    return em.fork().find(User, {});
  }

  @Mutation(() => UserResponse)
  async register(
    @Arg("options", () => UsernamePasswordInput) options: UsernamePasswordInput,
    @Ctx() { em }: MyContext
  ): Promise<UserResponse> {
    if (options.username.length <= 2) {
      return {
        errors: [
          {
            field: "username",
            message: "length must be greater than 2",
          },
        ],
      };
    }
    if (options.password.length <= 8) {
      return {
        errors: [
          {
            field: "password",
            message: "length must be greater than 8",
          },
        ],
      };
    }
    const hashedPassword = await argon2.hash(options.password);
    const user = em.fork().create(User, {
      username: options.username,
      password: hashedPassword,
    } as RequiredEntityData<User>);
    try {
      await em.fork().persistAndFlush(user);
    } catch (error) {
      if (error.code === "23505") {
        return {
          errors: [
            {
              field: "username",
              message: "already taken",
            },
          ],
        };
      }
    }
    return { user };
  }

  @Mutation(() => UserResponse)
  async login(
    @Arg("options", () => UsernamePasswordInput) options: UsernamePasswordInput,
    @Ctx() { em, req }: MyContext
  ): Promise<UserResponse> {
    const user = await em.fork().findOne(User, { username: options.username });
    if (!user) {
      return {
        errors: [
          {
            field: "username",
            message: "that username doesn't exist",
          },
        ],
      };
    }

    const valid = await argon2.verify(user.password, options.password);
    if (!valid) {
      return {
        errors: [
          {
            field: "password",
            message: "incorrect password",
          },
        ],
      };
    }

    req.session!.UserID = user.id;

    return { user };
  }
}
